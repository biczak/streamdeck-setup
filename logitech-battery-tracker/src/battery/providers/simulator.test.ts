import { describe, it, expect } from "vitest";
import { SimulatorProvider } from "./simulator";

describe("SimulatorProvider", () => {
	it("is unavailable unless LBP_SIMULATE=1", async () => {
		const prev = process.env.LBP_SIMULATE;
		try {
			delete process.env.LBP_SIMULATE;
			expect(await new SimulatorProvider().available()).toBe(false);
			process.env.LBP_SIMULATE = "1";
			expect(await new SimulatorProvider().available()).toBe(true);
		} finally {
			if (prev === undefined) delete process.env.LBP_SIMULATE;
			else process.env.LBP_SIMULATE = prev;
		}
	});
	it("lists fake devices and reads a deterministic active reading when gate is set", async () => {
		const prev = process.env.LBP_SIMULATE;
		try {
			process.env.LBP_SIMULATE = "1";
			const sim = new SimulatorProvider();
			const devices = await sim.list();
			expect(devices.length).toBeGreaterThan(0);
			const r = await sim.read(devices[0].id);
			expect(r.state).toBe("active");
			expect(r.percent).toBeGreaterThanOrEqual(0);
		} finally {
			if (prev === undefined) delete process.env.LBP_SIMULATE;
			else process.env.LBP_SIMULATE = prev;
		}
	});
	it("read() returns state 'off' when gate is unset", async () => {
		const prev = process.env.LBP_SIMULATE;
		try {
			delete process.env.LBP_SIMULATE;
			const sim = new SimulatorProvider();
			const r = await sim.read("simulator:mouse");
			expect(r.state).toBe("off");
		} finally {
			if (prev === undefined) delete process.env.LBP_SIMULATE;
			else process.env.LBP_SIMULATE = prev;
		}
	});
});
