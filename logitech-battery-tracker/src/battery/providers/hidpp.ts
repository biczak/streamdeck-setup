import type { Device } from "node-hid";
import streamDeck from "@elgato/streamdeck";
import type { BatteryProvider, BatteryReading, DeviceInfo } from "../types";
import {
	buildLongRequest, buildShortRequest, parseResponse, matches, RECEIVER_INDEX, IROOT_INDEX, HIDPP_SHORT, HIDPP_LONG, type ParsedResponse,
} from "../hidpp/reports";
import {
	FEATURE_UNIFIED_BATTERY, FEATURE_BATTERY_STATUS, FEATURE_BATTERY_VOLTAGE,
	parseUnified1004, parseStatus1000, parseVoltage1001, type BatteryParse,
} from "../hidpp/battery";
import {
	buildPairingInfoRequest, buildDeviceNameRequest, parsePairingInfo, parseDeviceName,
} from "../hidpp/enumerate";

export const LOGITECH_VID = 0x046d;
export const HIDPP_USAGE_PAGE = 0xff00;
const REQUEST_TIMEOUT_MS = 800;

// Enabling spontaneous notifications: a HID++ 1.0 SET_REGISTER on register 0x00. The
// 3-byte flag value asks the receiver to forward battery + wireless device events.
const SUBID_SET_REGISTER = 0x80;
const REG_NOTIFICATIONS = 0x00;
const NOTIF_FLAGS = [0x10, 0x08, 0x01];
// Backstop poll for watch(): events handle instant changes; this just refreshes the
// level periodically and recovers if an event was missed (long, to spare device battery).
const SAFETY_POLL_MS = 300_000;

type NodeHid = typeof import("node-hid");
let hidModule: NodeHid | undefined;
async function loadHid(): Promise<NodeHid | null> {
	if (hidModule === undefined) {
		try {
			hidModule = await import("node-hid");
		} catch (e) {
			streamDeck.logger.warn("hidpp: node-hid failed to load", e as Error);
			return null; // leave hidModule undefined so a later call retries
		}
	}
	return hidModule;
}

/** Pure: keep only Logitech vendor-defined HID++ collections (usage page 0xFF00). */
export function selectHidppPaths(devices: Device[]): Device[] {
	return devices.filter((d) => d.vendorId === LOGITECH_VID && d.usagePage === HIDPP_USAGE_PAGE);
}

type PendingRequest = { req: Buffer; resolve: (r: ParsedResponse) => void; timer: ReturnType<typeof setTimeout> };

/**
 * A dual-collection HID++ transport. ONE persistent `data` listener stays attached to
 * each handle for the transport's lifetime: node-hid's HIDAsync CLOSES the device when
 * its last `data` listener is removed, so per-request add/remove (the obvious pattern)
 * breaks every request after the first. Each incoming report is dispatched to the
 * matching pending request instead.
 */
class HidppTransport {
	private swId = 0;
	private pending: PendingRequest[] = [];
	/** Set to receive spontaneous device events (swId 0), e.g. battery-status changes. */
	onNotification?: (res: ParsedResponse) => void;
	private readonly onData = (data: Buffer): void => {
		const res = parseResponse(data);
		if (res.kind === "notification") {
			this.onNotification?.(res);
			return;
		}
		const i = this.pending.findIndex((p) => matches(p.req, res));
		if (i === -1) return;
		const [entry] = this.pending.splice(i, 1);
		clearTimeout(entry.timer);
		entry.resolve(res);
	};

	private constructor(
		private long: Awaited<ReturnType<NodeHid["HIDAsync"]["open"]>>,
		private short: Awaited<ReturnType<NodeHid["HIDAsync"]["open"]>> | null,
	) {
		this.long.on("data", this.onData);
		this.short?.on("data", this.onData);
	}

	static async open(longPath: string, shortPath: string | null, HID: NodeHid): Promise<HidppTransport> {
		const long = await HID.HIDAsync.open(longPath);
		let short: Awaited<ReturnType<NodeHid["HIDAsync"]["open"]>> | null = null;
		if (shortPath) {
			try {
				short = await HID.HIDAsync.open(shortPath);
			} catch {
				short = null; // short collection optional; 2.0 feature reads still work without it
			}
		}
		return new HidppTransport(long, short);
	}

	async close(): Promise<void> {
		// Removing the last `data` listener can itself close the node-hid handle, and two
		// collections of one interface can report "already closed" — never throw here.
		this.long.off("data", this.onData);
		this.short?.off("data", this.onData);
		try {
			await this.long.close();
		} catch {
			/* already closed/closing */
		}
		if (this.short) {
			try {
				await this.short.close();
			} catch {
				/* already closed/closing */
			}
		}
	}

	private nextSwId(): number {
		this.swId = (this.swId % 14) + 1; // 1..14; never 0 (0 marks a spontaneous notification)
		return this.swId;
	}

	private drop(entry: PendingRequest): void {
		const i = this.pending.indexOf(entry);
		if (i !== -1) this.pending.splice(i, 1);
	}

	request(req: Buffer): Promise<ParsedResponse> {
		// Fresh software id per HID++ 2.0 (long) request so a late response from a prior,
		// timed-out request cannot satisfy this one.
		if (req[0] === HIDPP_LONG) {
			req[3] = (req[3] & 0xf0) | this.nextSwId();
		}
		// HID++ 1.0 short register requests go out on the short collection; their long
		// responses arrive on the long collection — the persistent listener covers both.
		const writeDev = req[0] === HIDPP_SHORT && this.short ? this.short : this.long;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.drop(entry);
				reject(new Error("hidpp-timeout"));
			}, REQUEST_TIMEOUT_MS);
			const entry: PendingRequest = { req, resolve, timer };
			this.pending.push(entry);
			writeDev.write(Array.from(req)).catch((e: Error) => {
				clearTimeout(timer);
				this.drop(entry);
				reject(e);
			});
		});
	}
}

async function getFeatureIndex(t: HidppTransport, deviceIndex: number, featureId: number): Promise<number> {
	const res = await t.request(buildLongRequest(deviceIndex, IROOT_INDEX, 0, [(featureId >> 8) & 0xff, featureId & 0xff]));
	if (res.isError) return 0;
	return res.params[0] ?? 0;
}

// Resolve one battery feature and parse it. Any failure — unsupported feature,
// error frame, or a timeout on this probe — yields null so the caller can fall
// through to the next preferred feature rather than aborting the whole read.
async function tryFeature(
	t: HidppTransport,
	deviceIndex: number,
	featureId: number,
	fn: number,
	parse: (params: Buffer) => BatteryParse,
): Promise<BatteryParse | null> {
	try {
		const index = await getFeatureIndex(t, deviceIndex, featureId);
		if (!index) return null;
		const res = await t.request(buildLongRequest(deviceIndex, index, fn));
		if (res.isError) return null;
		return parse(res.params);
	} catch {
		return null;
	}
}

// Battery features in preference order: id, the status-read function index, and parser.
const BATTERY_FEATURES = [
	{ id: FEATURE_UNIFIED_BATTERY, fn: 1, parse: parseUnified1004 },
	{ id: FEATURE_BATTERY_STATUS, fn: 0, parse: parseStatus1000 },
	{ id: FEATURE_BATTERY_VOLTAGE, fn: 0, parse: parseVoltage1001 },
] as const;

async function readBattery(t: HidppTransport, deviceIndex: number): Promise<BatteryParse | null> {
	for (const f of BATTERY_FEATURES) {
		const parsed = await tryFeature(t, deviceIndex, f.id, f.fn, f.parse);
		if (parsed) return parsed;
	}
	return null;
}

type BatteryFeature = { index: number; parse: (params: Buffer) => BatteryParse };

// Resolve the device's supported battery feature once, so a spontaneous event for it
// can be recognised and parsed without re-discovering the feature each time.
async function resolveBatteryFeature(t: HidppTransport, deviceIndex: number): Promise<BatteryFeature | null> {
	for (const f of BATTERY_FEATURES) {
		try {
			const index = await getFeatureIndex(t, deviceIndex, f.id);
			if (index) return { index, parse: f.parse };
		} catch {
			/* try next feature */
		}
	}
	return null;
}

export class HidppProvider implements BatteryProvider {
	readonly source = "hidpp" as const;

	private paths: { long: string; short: string | null } | null = null;

	private async resolvePaths(): Promise<{ long: string; short: string | null } | null> {
		if (this.paths) return this.paths;
		const HID = await loadHid();
		if (!HID) return null;
		const all = HID.devices();
		const entries = selectHidppPaths(all);
		streamDeck.logger.info(
			`hidpp: node-hid sees ${all.length} HID device(s), ${entries.length} match Logitech HID++ (vid=0x046d, usagePage=0xff00)`,
		);
		const long = entries.find((d) => d.usage === 2 && d.path)?.path ?? null;
		const short = entries.find((d) => d.usage === 1 && d.path)?.path ?? null;
		if (!long) return null;
		this.paths = { long, short };
		return this.paths;
	}

	private invalidatePaths(): void {
		this.paths = null;
	}

	async available(): Promise<boolean> {
		return (await this.resolvePaths()) !== null;
	}

	async list(): Promise<DeviceInfo[]> {
		const HID = await loadHid();
		const paths = await this.resolvePaths();
		if (!HID || !paths) return [];
		const out: DeviceInfo[] = [];
		let t: HidppTransport | undefined;
		try {
			t = await HidppTransport.open(paths.long, paths.short, HID);
			for (let n = 1; n <= 6; n++) {
				try {
					const info = await t.request(buildPairingInfoRequest(n));
					if (info.isError) continue;
					const { kindName } = parsePairingInfo(info.params);
					let name = kindName;
					try {
						const nameRes = await t.request(buildDeviceNameRequest(n));
						if (!nameRes.isError) name = parseDeviceName(nameRes.params) || kindName;
					} catch {
						/* keep kindName */
					}
					out.push({ id: `hidpp:${n}`, name, kind: kindName, source: "hidpp" });
				} catch {
					/* device slot empty / asleep */
				}
			}
			if (out.length === 0) {
				// Only advertise a direct (receiver-less) device if index 0xFF actually
				// answers, so a transient all-slots-timeout on a real receiver does not
				// fabricate a phantom device that always reads asleep.
				try {
					const ping = await t.request(buildLongRequest(RECEIVER_INDEX, IROOT_INDEX, 0, [0x00, 0x00]));
					if (!ping.isError) out.push({ id: `hidpp:${RECEIVER_INDEX}`, name: "Logitech device", source: "hidpp" });
				} catch {
					/* nothing answering at 0xFF — no direct device */
				}
			}
		} catch {
			this.invalidatePaths();
		} finally {
			await t?.close();
		}
		return out;
	}

	async read(deviceId: string): Promise<BatteryReading> {
		const deviceIndex = Number(deviceId.split(":")[1]);
		const offline: BatteryReading = { deviceId, name: "Logitech device", percent: 0, state: "off", charging: false };
		// Valid HID++ device indices are 1..6 (paired) or 0xFF (receiver/direct). Reject
		// anything else — notably Number("") === 0 from a malformed "hidpp:" id.
		if (!Number.isInteger(deviceIndex) || !((deviceIndex >= 1 && deviceIndex <= 6) || deviceIndex === RECEIVER_INDEX)) {
			return offline;
		}
		const HID = await loadHid();
		const paths = await this.resolvePaths();
		if (!HID || !paths) return offline;
		let t: HidppTransport | undefined;
		try {
			// Battery reads are all HID++ 2.0 (long) requests, so the short collection is
			// not needed here — open only the long handle.
			t = await HidppTransport.open(paths.long, null, HID);
			const parsed = await readBattery(t, deviceIndex);
			if (!parsed) return { ...offline, state: "asleep" };
			return { deviceId, name: "Logitech device", percent: parsed.percent, state: "active", charging: parsed.charging, full: parsed.full };
		} catch {
			this.invalidatePaths();
			return { ...offline, state: "asleep" };
		} finally {
			await t?.close();
		}
	}

	/**
	 * Event-driven updates: holds the device handle open, enables receiver notifications,
	 * and pushes a reading whenever the device reports a battery change (instant) — plus an
	 * infrequent safety read. Never rejects; pushes an offline reading if it can't start.
	 */
	async watch(deviceId: string, onReading: (r: BatteryReading) => void): Promise<() => void> {
		const deviceIndex = Number(deviceId.split(":")[1]);
		const offline: BatteryReading = { deviceId, name: "Logitech device", percent: 0, state: "off", charging: false };
		const valid = Number.isInteger(deviceIndex) && ((deviceIndex >= 1 && deviceIndex <= 6) || deviceIndex === RECEIVER_INDEX);
		const HID = valid ? await loadHid() : null;
		const paths = HID ? await this.resolvePaths() : null;
		if (!HID || !paths) {
			onReading(offline);
			return () => {};
		}

		let stopped = false;
		let t: HidppTransport | undefined;
		const active = (parsed: BatteryParse): BatteryReading => ({
			deviceId, name: "Logitech device", percent: parsed.percent, state: "active", charging: parsed.charging, full: parsed.full,
		});
		const safetyRead = async (): Promise<void> => {
			if (!t || stopped) return;
			try {
				const parsed = await readBattery(t, deviceIndex);
				if (!stopped) onReading(parsed ? active(parsed) : { ...offline, state: "asleep" });
			} catch {
				if (!stopped) onReading({ ...offline, state: "asleep" });
			}
		};

		try {
			// The short collection is needed: enabling notifications is a HID++ 1.0 short request.
			t = await HidppTransport.open(paths.long, paths.short, HID);
			try {
				await t.request(buildShortRequest(RECEIVER_INDEX, SUBID_SET_REGISTER, REG_NOTIFICATIONS, NOTIF_FLAGS));
			} catch {
				/* some receivers forward events without this — best effort */
			}
			const feat = await resolveBatteryFeature(t, deviceIndex);
			if (feat) {
				t.onNotification = (res) => {
					if (stopped || res.deviceIndex !== deviceIndex || res.featureIndex !== feat.index) return;
					try {
						onReading(active(feat.parse(res.params)));
					} catch {
						/* ignore a malformed event */
					}
				};
			}
			await safetyRead(); // initial value
		} catch {
			this.invalidatePaths();
			onReading({ ...offline, state: "asleep" });
		}

		const interval = setInterval(() => void safetyRead(), SAFETY_POLL_MS);
		return () => {
			stopped = true;
			clearInterval(interval);
			void t?.close().catch(() => {});
		};
	}
}
