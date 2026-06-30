import { describe, it, expect } from "vitest";
import { parseDeviceList, parseBatteryState } from "./ghub";

describe("ghub payload parsing", () => {
	it("extracts battery-capable devices", () => {
		const payload = { deviceInfos: [
			{ deviceId: "dev1", displayName: "G Pro Wireless", deviceType: "mouse", capabilities: { hasBatteryStatus: true } },
			{ deviceId: "dev2", displayName: "No Battery KB", deviceType: "keyboard", capabilities: { hasBatteryStatus: false } },
		]};
		const out = parseDeviceList(payload);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ id: "ghub:dev1", name: "G Pro Wireless", source: "ghub" });
	});
	it("reads percent + charging from a battery payload", () => {
		expect(parseBatteryState("ghub:dev1", { percentage: 64, charging: true })).toEqual({ percent: 64, charging: true, state: "active" });
	});
	it("treats a missing percentage as asleep", () => {
		expect(parseBatteryState("ghub:dev1", {}).state).toBe("asleep");
	});
	it("treats a non-finite percentage as asleep (no NaN leaks to the renderer)", () => {
		expect(parseBatteryState("ghub:dev1", { percentage: NaN })).toEqual({ percent: 0, charging: false, state: "asleep" });
	});
	it("returns [] for null / malformed device-list payloads", () => {
		expect(parseDeviceList(null)).toEqual([]);
		expect(parseDeviceList({ deviceInfos: null })).toEqual([]);
		expect(parseDeviceList({ deviceInfos: [null] })).toEqual([]);
	});
});
