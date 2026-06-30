import { describe, it, expect } from "vitest";
import { voltageToPercent } from "./voltage-table";

describe("voltageToPercent (approximate Li-ion)", () => {
	it("anchors near 100% and 0%", () => {
		expect(voltageToPercent(4186)).toBe(100);
		expect(voltageToPercent(4300)).toBe(100);
		expect(voltageToPercent(3500)).toBe(0);
		expect(voltageToPercent(3000)).toBe(0);
	});
	it("is monotonic and mid-range plausible", () => {
		const mid = voltageToPercent(3800);
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(100);
		expect(voltageToPercent(3900)).toBeGreaterThanOrEqual(mid);
	});
});
