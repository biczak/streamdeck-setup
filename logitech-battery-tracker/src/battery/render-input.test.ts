import { describe, it, expect } from "vitest";
import { readingToRenderInput } from "./render-input";
import type { BatteryReading } from "./types";

const reading: BatteryReading = { deviceId: "hidpp:1", name: "Mouse", percent: 72, state: "active", charging: true };

describe("readingToRenderInput", () => {
	it("applies defaults when settings are empty", () => {
		const ri = readingToRenderInput(reading, {});
		expect(ri).toMatchObject({ percent: 72, state: "active", charging: true, showNumber: true, colorMode: "smooth", chargeAccent: "#ffd54f" });
	});
	it("honors explicit settings", () => {
		const ri = readingToRenderInput(reading, { showNumber: false, colorMode: "tiers", chargeAccent: "#5cc8ff" });
		expect(ri).toMatchObject({ showNumber: false, colorMode: "tiers", chargeAccent: "#5cc8ff" });
	});
	it("maps a null reading (no device) to the off state at 0%", () => {
		const ri = readingToRenderInput(null, {});
		expect(ri).toMatchObject({ state: "off", percent: 0, charging: false });
	});
});
