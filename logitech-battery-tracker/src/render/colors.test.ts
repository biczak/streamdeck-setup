import { describe, it, expect } from "vitest";
import { fillColorFor } from "./colors";

describe("fillColorFor", () => {
	it("tiers: red/amber/green by threshold", () => {
		expect(fillColorFor(10, "tiers")).toBe("#e5484d");
		expect(fillColorFor(20, "tiers")).toBe("#e5484d");
		expect(fillColorFor(40, "tiers")).toBe("#f5a524");
		expect(fillColorFor(55, "tiers")).toBe("#f5a524");
		expect(fillColorFor(80, "tiers")).toBe("#46a758");
	});
	it("smooth: returns hex (Stream Deck has no hsl()), red->green across range, clamped", () => {
		const at0 = fillColorFor(0, "smooth");
		const at100 = fillColorFor(100, "smooth");
		expect(at0).toMatch(/^#[0-9a-f]{6}$/);
		expect(at100).toMatch(/^#[0-9a-f]{6}$/);
		const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
		const [r0, g0] = rgb(at0);
		const [r100, g100] = rgb(at100);
		expect(r0).toBeGreaterThan(g0); // hue 0 = red
		expect(g100).toBeGreaterThan(r100); // hue 120 = green
		expect(fillColorFor(200, "smooth")).toBe(at100); // clamped at hue 120
	});
});
