import type { ColorMode, ConnState } from "../render/colors";

export type ProviderSource = "hidpp" | "ghub" | "simulator";

export interface BatteryReading {
	deviceId: string;
	name: string;
	percent: number; // 0..100; last-known when state is "asleep"
	state: ConnState;
	charging: boolean;
}

export interface DeviceInfo {
	id: string; // "<source>:<...>" — routable back to its provider
	name: string;
	kind?: string;
	source: ProviderSource;
}

export interface BatteryProvider {
	readonly source: ProviderSource;
	available(): Promise<boolean>;
	list(): Promise<DeviceInfo[]>;
	read(deviceId: string): Promise<BatteryReading>;
	/**
	 * Optional event-driven updates: push a reading immediately and whenever the device
	 * reports a change, until the returned unsubscribe is called. When a provider offers
	 * this, the service prefers it over polling read() on an interval.
	 */
	watch?(deviceId: string, onReading: (r: BatteryReading) => void): Promise<() => void>;
}

export interface KeySettings {
	deviceId?: string;
	showNumber?: boolean;
	colorMode?: ColorMode;
	chargeAccent?: string;
	pollSeconds?: number;
}

export const DEFAULT_SETTINGS: Required<Omit<KeySettings, "deviceId">> = {
	showNumber: true,
	colorMode: "smooth",
	chargeAccent: "#ffd54f",
	pollSeconds: 60,
};
