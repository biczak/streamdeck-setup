export const HIDPP_SHORT = 0x10;
export const HIDPP_LONG = 0x11;
export const SHORT_LEN = 7;
export const LONG_LEN = 20;
export const SW_ID = 0x0a;
export const RECEIVER_INDEX = 0xff;
export const IROOT_INDEX = 0x00;

const ERR_SHORT_SUBID = 0x8f; // HID++ 1.0 error report
const ERR_LONG_FEATURE = 0xff; // HID++ 2.0 error report

export function funcByte(fn: number, swId: number = SW_ID): number {
	return ((fn & 0x0f) << 4) | (swId & 0x0f);
}

export function buildLongRequest(deviceIndex: number, featureIndex: number, fn: number, params: number[] = []): Buffer {
	const buf = Buffer.alloc(LONG_LEN);
	buf[0] = HIDPP_LONG;
	buf[1] = deviceIndex;
	buf[2] = featureIndex;
	buf[3] = funcByte(fn);
	for (let i = 0; i < params.length && i < 16; i++) buf[4 + i] = params[i] & 0xff;
	return buf;
}

export function buildShortRequest(deviceIndex: number, subId: number, address: number, params: number[] = []): Buffer {
	const buf = Buffer.alloc(SHORT_LEN);
	buf[0] = HIDPP_SHORT;
	buf[1] = deviceIndex;
	buf[2] = subId;
	buf[3] = address;
	for (let i = 0; i < params.length && i < 3; i++) buf[4 + i] = params[i] & 0xff;
	return buf;
}

export interface ParsedResponse {
	reportId: number;
	deviceIndex: number;
	featureIndex: number;
	funcByte: number;
	swId: number;
	params: Buffer;
	isError: boolean;
	errorCode?: number;
	kind: "feature" | "error" | "notification";
}

export function parseResponse(buf: Buffer): ParsedResponse {
	const reportId = buf[0];
	const deviceIndex = buf[1];
	if (buf[2] === ERR_SHORT_SUBID) {
		return { reportId, deviceIndex, featureIndex: buf[3], funcByte: 0, swId: 0, params: buf.subarray(4), isError: true, errorCode: buf[5], kind: "error" };
	}
	if (buf[2] === ERR_LONG_FEATURE) {
		return { reportId, deviceIndex, featureIndex: buf[3], funcByte: buf[4], swId: buf[4] & 0x0f, params: buf.subarray(5), isError: true, errorCode: buf[5], kind: "error" };
	}
	const fByte = buf[3];
	const swId = fByte & 0x0f;
	return { reportId, deviceIndex, featureIndex: buf[2], funcByte: fByte, swId, params: buf.subarray(4), isError: false, errorCode: undefined, kind: swId === 0 ? "notification" : "feature" };
}

/** True when a response corresponds to a request we sent (same device + feature/sub + our swId). */
export function matches(req: Buffer, res: ParsedResponse): boolean {
	if (res.deviceIndex !== req[1]) return false;
	const isShortReq = req[0] === HIDPP_SHORT;
	if (res.isError) {
		if (res.featureIndex !== req[2]) return false;
		// HID++ 2.0 (long) requests carry a software id that the error frame echoes; verify it.
		if (!isShortReq && res.swId !== (req[3] & 0x0f)) return false;
		return true;
	}
	if (res.featureIndex !== req[2]) return false;
	if (isShortReq) {
		// HID++ 1.0 register read: the long response echoes the register at byte 3.
		return res.funcByte === req[3];
	}
	// HID++ 2.0 feature response: correlate by the per-request software id.
	return res.swId === (req[3] & 0x0f);
}
