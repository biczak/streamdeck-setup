import { describe, it, expect } from "vitest";
import { buildPairingInfoRequest, buildDeviceNameRequest, parsePairingInfo, parseDeviceName } from "./enumerate";

describe("hidpp enumeration", () => {
	it("pairing-info request targets register 0xb5 sub 0x20+(n-1) on the receiver", () => {
		const b = buildPairingInfoRequest(1);
		expect([b[0], b[1], b[2], b[3], b[4]]).toEqual([0x10, 0xff, 0x83, 0xb5, 0x20]);
		expect(buildPairingInfoRequest(3)[4]).toBe(0x22);
	});
	it("device-name request uses sub 0x40+(n-1)", () => {
		expect(buildDeviceNameRequest(1)[4]).toBe(0x40);
		expect(buildDeviceNameRequest(2)[4]).toBe(0x41);
	});
	it("parses WPID and device kind", () => {
		// params: [echoSub, ?, ?, wpidHi, wpidLo, ?, ?, kindNibble, ...]
		const params = Buffer.alloc(16);
		params[3] = 0x40; params[4] = 0x7a; // WPID 0x407a
		params[7] = 0x02; // mouse
		const r = parsePairingInfo(params);
		expect(r.wpid).toBe(0x407a);
		expect(r.kind).toBe(2);
		expect(r.kindName).toBe("mouse");
	});
	it("parses an ASCII codename", () => {
		const name = "K780";
		const params = Buffer.alloc(16);
		params[1] = name.length;
		Buffer.from(name, "ascii").copy(params, 2);
		expect(parseDeviceName(params)).toBe("K780");
	});
});
