import WebSocket from "ws";
import type { BatteryProvider, BatteryReading, DeviceInfo } from "../types";
import type { ConnState } from "../../render/colors";

export const GHUB_WS_URL = "ws://localhost:9010";
const CONNECT_TIMEOUT_MS = 1000;

export function parseDeviceList(payload: unknown): DeviceInfo[] {
	const infos = (payload as { deviceInfos?: unknown[] })?.deviceInfos;
	if (!Array.isArray(infos)) return [];
	const out: DeviceInfo[] = [];
	for (const raw of infos) {
		const d = raw as { deviceId?: string; displayName?: string; deviceType?: string; capabilities?: { hasBatteryStatus?: boolean } };
		if (!d?.deviceId || !d.capabilities?.hasBatteryStatus) continue;
		out.push({ id: `ghub:${d.deviceId}`, name: d.displayName ?? "Logitech device", kind: d.deviceType, source: "ghub" });
	}
	return out;
}

export function parseBatteryState(deviceId: string, payload: unknown): Pick<BatteryReading, "percent" | "charging" | "state"> {
	const p = payload as { percentage?: number; charging?: boolean };
	if (typeof p?.percentage !== "number" || !Number.isFinite(p.percentage)) {
		return { percent: 0, charging: false, state: "asleep" as ConnState };
	}
	return { percent: Math.round(p.percentage), charging: !!p.charging, state: "active" };
}

interface GHubMsg { msgId?: string; verb: string; path: string; payload?: unknown; result?: string }

let ghubMsgCounter = 0;

/** Open one short-lived connection, send one GET, resolve its payload. */
function ghubGet(path: string): Promise<unknown> {
	const msgId = `lbp-${++ghubMsgCounter}`;
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(GHUB_WS_URL, "json", { origin: "file://" });
		const timer = setTimeout(() => {
			ws.terminate();
			reject(new Error("ghub-timeout"));
		}, CONNECT_TIMEOUT_MS);
		ws.on("open", () => ws.send(JSON.stringify({ msgId, verb: "GET", path } satisfies GHubMsg)));
		ws.on("message", (data) => {
			let msg: GHubMsg;
			try {
				msg = JSON.parse(data.toString()) as GHubMsg;
			} catch {
				return; // ignore unparseable frames
			}
			// Skip unsolicited push notifications: our response echoes the msgId or the path.
			if (msg.msgId !== msgId && msg.path && msg.path !== path) return;
			clearTimeout(timer);
			ws.close();
			resolve(msg.payload);
		});
		ws.on("error", (e) => {
			clearTimeout(timer);
			ws.terminate();
			reject(e);
		});
	});
}

export class GHubProvider implements BatteryProvider {
	readonly source = "ghub" as const;

	async available(): Promise<boolean> {
		try {
			await ghubGet("/devices/list");
			return true;
		} catch {
			return false;
		}
	}

	async list(): Promise<DeviceInfo[]> {
		try {
			return parseDeviceList(await ghubGet("/devices/list"));
		} catch {
			return [];
		}
	}

	async read(deviceId: string): Promise<BatteryReading> {
		const rawId = deviceId.replace(/^ghub:/, "");
		try {
			const state = parseBatteryState(deviceId, await ghubGet(`/battery/${rawId}/state`));
			return { deviceId, name: "Logitech device", ...state };
		} catch {
			return { deviceId, name: "Logitech device", percent: 0, state: "asleep", charging: false };
		}
	}
}
