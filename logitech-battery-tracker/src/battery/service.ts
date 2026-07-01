import streamDeck from "@elgato/streamdeck";
import type { BatteryProvider, BatteryReading, DeviceInfo } from "./types";
import { HidppProvider } from "./providers/hidpp";
import { GHubProvider } from "./providers/ghub";
import { SimulatorProvider } from "./providers/simulator";

export class BatteryService {
	private lastGood = new Map<string, BatteryReading>();
	private names = new Map<string, string>();

	constructor(private providers: BatteryProvider[]) {}

	private providerFor(deviceId: string): BatteryProvider | undefined {
		const source = deviceId.split(":")[0];
		return this.providers.find((p) => p.source === source);
	}

	async listDevices(): Promise<DeviceInfo[]> {
		const byId = new Map<string, DeviceInfo>();
		for (const provider of this.providers) {
			try {
				if (!(await provider.available())) {
					streamDeck.logger.info(`listDevices: ${provider.source} unavailable`);
					continue;
				}
				const found = await provider.list();
				streamDeck.logger.info(`listDevices: ${provider.source} found ${found.length} device(s)`);
				for (const d of found) if (!byId.has(d.id)) { byId.set(d.id, d); this.names.set(d.id, d.name); }
			} catch (e) {
				streamDeck.logger.warn(`listDevices: ${provider.source} threw`, e as Error);
			}
		}
		return [...byId.values()];
	}

	// Cache the last active reading, degrade non-active states to last-known, and enrich
	// the name from the most recent device list. Used by both polling and watch().
	private applyReading(deviceId: string, reading: BatteryReading): BatteryReading {
		const cached = this.lastGood.get(deviceId);
		const name = this.names.get(deviceId);
		let out: BatteryReading;
		if (reading.state === "active") {
			this.lastGood.set(deviceId, reading);
			out = reading;
		} else if (cached) {
			out = { ...cached, state: reading.state }; // keep last-known percent, reflect off/asleep
		} else {
			out = reading;
		}
		return name ? { ...out, name } : out;
	}

	async readDevice(deviceId: string): Promise<BatteryReading> {
		const provider = this.providerFor(deviceId);
		if (!provider) {
			return this.applyReading(deviceId, { deviceId, name: "Logitech device", percent: 0, state: "off", charging: false });
		}
		try {
			return this.applyReading(deviceId, await provider.read(deviceId));
		} catch {
			return this.applyReading(deviceId, { deviceId, name: "Logitech device", percent: 0, state: "asleep", charging: false });
		}
	}

	subscribe(deviceId: string, pollSeconds: number, cb: (r: BatteryReading) => void): () => void {
		// Prefer event-driven updates when the provider supports them (HID++): instant
		// changes, no interval polling.
		const provider = this.providerFor(deviceId);
		if (provider?.watch) {
			let live = true;
			let unsub: (() => void) | undefined;
			provider
				.watch(deviceId, (reading) => {
					if (live) cb(this.applyReading(deviceId, reading));
				})
				.then((u) => {
					if (live) unsub = u;
					else u();
				})
				.catch(() => {
					/* watch failed to start; the key keeps its last image */
				});
			return () => {
				live = false;
				unsub?.();
			};
		}

		let stopped = false;
		let inFlight = false;
		const tick = async () => {
			if (inFlight) return; // skip overlapping polls (slow read at the min interval)
			inFlight = true;
			try {
				const reading = await this.readDevice(deviceId);
				if (!stopped) cb(reading);
			} finally {
				inFlight = false;
			}
		};
		void tick(); // immediate
		// Polling is per-subscription; per-device dedup is a future improvement.
		const seconds = Number.isFinite(pollSeconds) ? Math.max(5, pollSeconds) : 60;
		const timer = setInterval(() => void tick(), seconds * 1000);
		return () => {
			stopped = true;
			clearInterval(timer);
		};
	}
}

const providers: BatteryProvider[] = [new HidppProvider(), new GHubProvider(), new SimulatorProvider()];
export const batteryService = new BatteryService(providers);
