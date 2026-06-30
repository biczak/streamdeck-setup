import { describe, it, expect } from "vitest";
import { parseUnified1004, parseStatus1000, parseVoltage1001 } from "./battery";

describe("battery feature parsing", () => {
	it("0x1004: percent in p0, charging status in p2", () => {
		expect(parseUnified1004(Buffer.from([72, 0x04, 1, 0]))).toEqual({ percent: 72, charging: true, full: false });
		expect(parseUnified1004(Buffer.from([100, 0x08, 3, 0]))).toEqual({ percent: 100, charging: false, full: true });
		expect(parseUnified1004(Buffer.from([50, 0x04, 0, 0]))).toEqual({ percent: 50, charging: false, full: false });
	});
	it("0x1000: percent in p0, status in p2", () => {
		expect(parseStatus1000(Buffer.from([55, 60, 0]))).toEqual({ percent: 55, charging: false, full: false });
		expect(parseStatus1000(Buffer.from([90, 100, 1]))).toEqual({ percent: 90, charging: true, full: false });
		expect(parseStatus1000(Buffer.from([100, 100, 3]))).toEqual({ percent: 100, charging: false, full: true });
		// status 4 = recharging below optimal — still charging
		expect(parseStatus1000(Buffer.from([80, 0, 4]))).toEqual({ percent: 80, charging: true, full: false });
	});
	it("0x1001: be16 mV + charging flag bit7", () => {
		const dischargeFull = parseVoltage1001(Buffer.from([0x10, 0x5a, 0x00])); // 4186 mV, discharging
		expect(dischargeFull.percent).toBe(100);
		expect(dischargeFull.charging).toBe(false);
		const charging = parseVoltage1001(Buffer.from([0x0f, 0x00, 0x80])); // bit7 set, low bits 0 => charging
		expect(charging.charging).toBe(true);
		// bit7 set, low bits 1 => full (not charging)
		expect(parseVoltage1001(Buffer.from([0x0f, 0x00, 0x81]))).toMatchObject({ full: true, charging: false });
	});
});
