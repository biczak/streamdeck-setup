import { describe, it, expect, vi } from "vitest";
import { BatteryService } from "./service";
import type { BatteryProvider, BatteryReading, DeviceInfo } from "./types";

function fakeProvider(source: BatteryProvider["source"], devices: DeviceInfo[], reading?: BatteryReading): BatteryProvider {
	return {
		source,
		available: async () => true,
		list: async () => devices,
		read: async (id) => reading ?? { deviceId: id, name: "x", percent: 0, state: "off", charging: false },
	};
}

describe("BatteryService", () => {
	it("unions and dedupes device lists across providers", async () => {
		const svc = new BatteryService([
			fakeProvider("hidpp", [{ id: "hidpp:1", name: "Mouse", source: "hidpp" }]),
			fakeProvider("ghub", [{ id: "ghub:dev1", name: "Headset", source: "ghub" }]),
		]);
		const list = await svc.listDevices();
		expect(list.map((d) => d.id).sort()).toEqual(["ghub:dev1", "hidpp:1"]);
	});
	it("routes readDevice to the provider matching the id prefix", async () => {
		const reading: BatteryReading = { deviceId: "ghub:dev1", name: "Headset", percent: 64, state: "active", charging: false };
		const svc = new BatteryService([
			fakeProvider("hidpp", []),
			fakeProvider("ghub", [], reading),
		]);
		expect(await svc.readDevice("ghub:dev1")).toEqual(reading);
	});
	it("caches the last good percent and degrades to asleep on failure", async () => {
		let call = 0;
		const flaky: BatteryProvider = {
			source: "hidpp", available: async () => true, list: async () => [],
			read: async (id) => {
				call++;
				if (call === 1) return { deviceId: id, name: "Mouse", percent: 80, state: "active", charging: false };
				throw new Error("offline");
			},
		};
		const svc = new BatteryService([flaky]);
		expect((await svc.readDevice("hidpp:1")).percent).toBe(80);
		const second = await svc.readDevice("hidpp:1");
		expect(second.state).toBe("asleep");
		expect(second.percent).toBe(80); // last-known retained
	});
	it("subscribe polls immediately and on interval, and unsubscribe stops it", async () => {
		vi.useFakeTimers();
		try {
			const reading: BatteryReading = { deviceId: "hidpp:1", name: "Mouse", percent: 50, state: "active", charging: false };
			const svc = new BatteryService([fakeProvider("hidpp", [], reading)]);
			const cb = vi.fn();
			const stop = svc.subscribe("hidpp:1", 60, cb);
			await vi.advanceTimersByTimeAsync(0);     // immediate poll
			expect(cb).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(60_000); // one interval
			expect(cb).toHaveBeenCalledTimes(2);
			stop();
			await vi.advanceTimersByTimeAsync(120_000);
			expect(cb).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});
	it("skips providers that are unavailable or throw when listing", async () => {
		const off = (id: string): BatteryReading => ({ deviceId: id, name: "x", percent: 0, state: "off", charging: false });
		const unavailable: BatteryProvider = {
			source: "ghub", available: async () => false,
			list: async () => [{ id: "ghub:x", name: "X", source: "ghub" }], read: async (id) => off(id),
		};
		const throwing: BatteryProvider = {
			source: "simulator", available: async () => { throw new Error("boom"); },
			list: async () => [], read: async (id) => off(id),
		};
		const svc = new BatteryService([
			fakeProvider("hidpp", [{ id: "hidpp:1", name: "Mouse", source: "hidpp" }]),
			unavailable,
			throwing,
		]);
		expect((await svc.listDevices()).map((d) => d.id)).toEqual(["hidpp:1"]);
	});
	it("degrades to off when no provider matches the id prefix", async () => {
		const svc = new BatteryService([fakeProvider("hidpp", [])]);
		const r = await svc.readDevice("ghub:dev1");
		expect(r.state).toBe("off");
		expect(r.percent).toBe(0);
	});
	it("treats NaN pollSeconds as 60s (no busy loop)", async () => {
		vi.useFakeTimers();
		try {
			const reading: BatteryReading = { deviceId: "hidpp:1", name: "Mouse", percent: 50, state: "active", charging: false };
			const svc = new BatteryService([fakeProvider("hidpp", [], reading)]);
			const cb = vi.fn();
			const stop = svc.subscribe("hidpp:1", NaN, cb);
			await vi.advanceTimersByTimeAsync(0); // immediate poll fires
			expect(cb).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1000); // only 1s elapsed — no second call
			expect(cb).toHaveBeenCalledTimes(1);
			stop();
		} finally {
			vi.useRealTimers();
		}
	});
	it("enforces a 5s minimum poll interval (floors pollSeconds)", async () => {
		vi.useFakeTimers();
		try {
			const reading: BatteryReading = { deviceId: "hidpp:1", name: "Mouse", percent: 50, state: "active", charging: false };
			const svc = new BatteryService([fakeProvider("hidpp", [], reading)]);
			const cb = vi.fn();
			const stop = svc.subscribe("hidpp:1", 1, cb); // requests 1s; floored to 5s
			await vi.advanceTimersByTimeAsync(0);
			expect(cb).toHaveBeenCalledTimes(1); // immediate
			await vi.advanceTimersByTimeAsync(4000);
			expect(cb).toHaveBeenCalledTimes(1); // not at 4s
			await vi.advanceTimersByTimeAsync(1000);
			expect(cb).toHaveBeenCalledTimes(2); // fires at 5s
			stop();
		} finally {
			vi.useRealTimers();
		}
	});
	it("enriches readings with the device name from the last listDevices()", async () => {
		const reading: BatteryReading = { deviceId: "hidpp:1", name: "x", percent: 50, state: "active", charging: false };
		const p: BatteryProvider = {
			source: "hidpp", available: async () => true,
			list: async () => [{ id: "hidpp:1", name: "G Pro Wireless", source: "hidpp" }],
			read: async () => reading,
		};
		const svc = new BatteryService([p]);
		await svc.listDevices();
		expect((await svc.readDevice("hidpp:1")).name).toBe("G Pro Wireless");
	});
	it("does not re-enter a slow poll tick (in-flight guard)", async () => {
		vi.useFakeTimers();
		try {
			let active = 0, maxActive = 0;
			const p: BatteryProvider = {
				source: "hidpp", available: async () => true, list: async () => [],
				read: async (id) => {
					active++; maxActive = Math.max(maxActive, active);
					await new Promise((r) => setTimeout(r, 9000)); // slower than the 5s interval
					active--;
					return { deviceId: id, name: "x", percent: 1, state: "active", charging: false };
				},
			};
			const svc = new BatteryService([p]);
			const stop = svc.subscribe("hidpp:1", 5, () => {});
			await vi.advanceTimersByTimeAsync(12000); // would fire 2+ overlapping ticks without the guard
			expect(maxActive).toBe(1); // never more than one read in flight
			stop();
		} finally {
			vi.useRealTimers();
		}
	});
	it("prefers a provider's watch() (event-driven) over polling, and stops it on unsubscribe", async () => {
		let push: ((r: BatteryReading) => void) | undefined;
		let unsubscribed = false;
		const watchProvider: BatteryProvider = {
			source: "hidpp",
			available: async () => true,
			list: async () => [{ id: "hidpp:1", name: "Mouse", source: "hidpp" }],
			read: async (id) => ({ deviceId: id, name: "x", percent: 0, state: "off", charging: false }),
			watch: async (_id, onReading) => {
				push = onReading;
				return () => {
					unsubscribed = true;
				};
			},
		};
		const svc = new BatteryService([watchProvider]);
		await svc.listDevices(); // populate the name cache
		const cb = vi.fn();
		const stop = svc.subscribe("hidpp:1", 60, cb);
		await Promise.resolve(); // let watch() resolve
		push?.({ deviceId: "hidpp:1", name: "x", percent: 61, state: "active", charging: true });
		expect(cb).toHaveBeenCalledWith(expect.objectContaining({ percent: 61, charging: true, state: "active", name: "Mouse" }));
		stop();
		expect(unsubscribed).toBe(true);
		cb.mockClear();
		push?.({ deviceId: "hidpp:1", name: "x", percent: 50, state: "active", charging: false });
		expect(cb).not.toHaveBeenCalled(); // ignored after unsubscribe
	});
});
