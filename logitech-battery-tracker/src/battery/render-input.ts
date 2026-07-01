import type { RenderInput } from "../render/render-key";
import { DEFAULT_SETTINGS, type BatteryReading, type KeySettings } from "./types";

export function readingToRenderInput(reading: BatteryReading | null, settings: KeySettings): RenderInput {
	return {
		percent: reading?.percent ?? 0,
		state: reading?.state ?? "off",
		charging: reading?.charging ?? false,
		full: reading?.full ?? false,
		showNumber: settings.showNumber ?? DEFAULT_SETTINGS.showNumber,
		colorMode: settings.colorMode ?? DEFAULT_SETTINGS.colorMode,
		chargeAccent: settings.chargeAccent ?? DEFAULT_SETTINGS.chargeAccent,
	};
}
