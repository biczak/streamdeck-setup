import { buildShortRequest, RECEIVER_INDEX } from "./reports";

export const REG_PAIRING_INFO = 0xb5;
export const SUBID_GET_LONG = 0x83;

export const KIND_NAMES: Record<number, string> = {
	1: "keyboard", 2: "mouse", 3: "numpad", 4: "presenter",
	8: "trackball", 9: "touchpad", 0xa: "tablet", 0xb: "gamepad", 0xd: "headset",
};

// Pairing info for paired device n (1..6): register 0xB5, sub-register 0x20+(n-1).
export function buildPairingInfoRequest(n: number): Buffer {
	return buildShortRequest(RECEIVER_INDEX, SUBID_GET_LONG, REG_PAIRING_INFO, [0x20 + (n - 1)]);
}

// Device codename for paired device n: register 0xB5, sub-register 0x40+(n-1).
export function buildDeviceNameRequest(n: number): Buffer {
	return buildShortRequest(RECEIVER_INDEX, SUBID_GET_LONG, REG_PAIRING_INFO, [0x40 + (n - 1)]);
}

// params = 16 data bytes of the long-register read response (offsets per Solaar/kernel).
export function parsePairingInfo(params: Buffer): { wpid: number; kind: number; kindName: string } {
	const wpid = (params[3] << 8) | params[4];
	const kind = params[7] & 0x0f;
	return { wpid, kind, kindName: KIND_NAMES[kind] ?? "device" };
}

export function parseDeviceName(params: Buffer): string {
	const len = params[1];
	return params.subarray(2, 2 + len).toString("ascii").replace(/\0+$/, "");
}
