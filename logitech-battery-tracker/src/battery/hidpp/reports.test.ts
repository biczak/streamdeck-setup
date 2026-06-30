import { describe, it, expect } from "vitest";
import { buildLongRequest, buildShortRequest, funcByte, matches, parseResponse, SW_ID } from "./reports";

describe("hidpp reports", () => {
	it("packs funcByte as (fn<<4)|swId", () => {
		expect(funcByte(0)).toBe(SW_ID);
		expect(funcByte(1)).toBe((1 << 4) | SW_ID);
	});
	it("builds a 20-byte long request", () => {
		const b = buildLongRequest(0x01, 0x05, 1, [0x10, 0x04]);
		expect(b.length).toBe(20);
		expect([b[0], b[1], b[2], b[3], b[4], b[5]]).toEqual([0x11, 0x01, 0x05, (1 << 4) | SW_ID, 0x10, 0x04]);
	});
	it("builds a 7-byte short request", () => {
		const b = buildShortRequest(0xff, 0x83, 0xb5, [0x03]);
		expect(b.length).toBe(7);
		expect([b[0], b[1], b[2], b[3], b[4]]).toEqual([0x10, 0xff, 0x83, 0xb5, 0x03]);
	});
	it("parses a feature response", () => {
		const r = parseResponse(Buffer.from([0x11, 0x01, 0x05, (1 << 4) | SW_ID, 0x48, 0x01, 0x00]));
		expect(r.isError).toBe(false);
		expect(r.kind).toBe("feature");
		expect(r.featureIndex).toBe(0x05);
		expect(r.params[0]).toBe(0x48);
	});
	it("parses a HID++ 1.0 error (0x8f) as device-unreachable code 0x09", () => {
		const r = parseResponse(Buffer.from([0x10, 0x01, 0x8f, 0x83, 0xb5, 0x09, 0x00]));
		expect(r.isError).toBe(true);
		expect(r.errorCode).toBe(0x09);
	});
	it("parses a HID++ 2.0 error (0xff) with code at byte 5", () => {
		const r = parseResponse(Buffer.from([0x11, 0x01, 0xff, 0x05, (1 << 4) | SW_ID, 0x09, 0x00]));
		expect(r.isError).toBe(true);
		expect(r.errorCode).toBe(0x09);
	});
	it("flags spontaneous notifications (swId 0)", () => {
		const r = parseResponse(Buffer.from([0x11, 0x01, 0x05, 0x00, 0x00, 0x00, 0x00]));
		expect(r.kind).toBe("notification");
	});
});

describe("matches", () => {
	// Long request to device 0x01, feature 0x05, fn 1 -> funcByte (1<<4)|SW_ID, swId nibble = SW_ID.
	const req = buildLongRequest(0x01, 0x05, 1, [0x10, 0x04]);

	it("matches a feature response with same device, feature, and swId", () => {
		const res = parseResponse(Buffer.from([0x11, 0x01, 0x05, (1 << 4) | SW_ID, 0x48, 0x01, 0x00]));
		expect(matches(req, res)).toBe(true);
	});
	it("rejects a response from a different device index", () => {
		const res = parseResponse(Buffer.from([0x11, 0x02, 0x05, (1 << 4) | SW_ID, 0x48, 0x01, 0x00]));
		expect(matches(req, res)).toBe(false);
	});
	it("rejects a response with a different swId (someone else's request)", () => {
		const res = parseResponse(Buffer.from([0x11, 0x01, 0x05, (1 << 4) | 0x05, 0x48, 0x01, 0x00]));
		expect(matches(req, res)).toBe(false);
	});
	it("rejects a response with a different feature index", () => {
		const res = parseResponse(Buffer.from([0x11, 0x01, 0x06, (1 << 4) | SW_ID, 0x48, 0x01, 0x00]));
		expect(matches(req, res)).toBe(false);
	});
	it("matches a 2.0 error frame echoing this request's feature index", () => {
		const res = parseResponse(Buffer.from([0x11, 0x01, 0xff, 0x05, (1 << 4) | SW_ID, 0x09, 0x00]));
		expect(matches(req, res)).toBe(true);
	});
	it("does NOT match an error frame whose feature index equals req funcByte (no false positive)", () => {
		// funcByte of req is (1<<4)|SW_ID = 0x1a; an error echoing 0x1a must not correlate.
		const res = parseResponse(Buffer.from([0x11, 0x01, 0xff, 0x1a, 0x00, 0x09, 0x00]));
		expect(matches(req, res)).toBe(false);
	});
	it("rejects a 2.0 error frame whose swId differs (not our request)", () => {
		// req has swId nibble SW_ID; the error echoes a different swId 0x07.
		const res = parseResponse(Buffer.from([0x11, 0x01, 0xff, 0x05, (1 << 4) | 0x07, 0x09, 0x00]));
		expect(matches(req, res)).toBe(false);
	});
	it("does not let a late response from a prior swId match the next request", () => {
		// Two IROOT requests that differ ONLY in swId (as the transport assigns per request).
		const reqA = buildLongRequest(0x01, 0x00, 0);
		reqA[3] = (reqA[3] & 0xf0) | 0x03;
		const reqB = buildLongRequest(0x01, 0x00, 0);
		reqB[3] = (reqB[3] & 0xf0) | 0x04;
		// Response echoes reqA's swId 0x03 (feature index 0x00 IROOT).
		const lateA = parseResponse(Buffer.from([0x11, 0x01, 0x00, (0 << 4) | 0x03, 0x07, 0x00, 0x00]));
		expect(matches(reqA, lateA)).toBe(true);
		expect(matches(reqB, lateA)).toBe(false);
	});
});
