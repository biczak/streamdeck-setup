import { describe, it, expect } from "vitest";
import { renderKey, type RenderInput } from "./render-key";
import { fillColorFor } from "./colors";

const base: RenderInput = {
	percent: 72, state: "active", charging: false, full: false,
	showNumber: true, colorMode: "smooth", chargeAccent: "#ffd54f",
};

describe("renderKey", () => {
	it("returns a 144x144 svg", () => {
		const svg = renderKey(base);
		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg).toContain('width="144"');
		expect(svg).toContain('height="144"');
	});
	it("active: light stroke and smooth (hex) fill color", () => {
		const svg = renderKey(base);
		expect(svg).toContain("#e9e9ec"); // stroke when active
		expect(svg).toContain(fillColorFor(72, "smooth")); // smooth fill, hex
	});
	it("draws the percentage label as text", () => {
		const svg = renderKey(base);
		expect(svg).toContain('data-pct="'); // number present, marker is VALUED (XML well-formed)
		expect(svg).toContain(">72%<");
	});
	it("emits well-formed XML: no valueless attributes (Stream Deck blanks on those)", () => {
		const svg = renderKey({ ...base, charging: true }); // exercise number + badge markers
		// An attribute name immediately followed by whitespace or > (not '=') is malformed XML.
		expect(svg).not.toMatch(/\sdata-[a-z]+(?=[\s/>])/);
	});
	it("hides the number when showNumber is false", () => {
		expect(renderKey({ ...base, showNumber: false })).not.toContain("data-pct");
	});
	it("off: empty fill and dim stroke", () => {
		const svg = renderKey({ ...base, state: "off" });
		expect(svg).toContain('data-fill-width="0"');
		expect(svg).toContain("#5b5b62"); // off stroke
	});
	it("asleep: fill opacity 0.4", () => {
		expect(renderKey({ ...base, state: "asleep" })).toContain('fill-opacity="0.4"');
	});
	it("charging tints the battery outline with the accent color (no badge)", () => {
		expect(renderKey({ ...base, charging: true, chargeAccent: "#5cc8ff" })).toContain('stroke="#5cc8ff"');
		expect(renderKey({ ...base, charging: false })).toContain('stroke="#e9e9ec"'); // active, not charging -> white
		// inactive stays grey even when "charging" is set
		expect(renderKey({ ...base, charging: true, state: "asleep", chargeAccent: "#5cc8ff" })).not.toContain('stroke="#5cc8ff"');
		expect(renderKey({ ...base, charging: true })).not.toContain("data-badge");
	});
	it("charging at 100% tints the outline #57A4DE instead of the accent color", () => {
		const svg = renderKey({ ...base, charging: true, percent: 100, chargeAccent: "#5cc8ff" });
		expect(svg).toContain('stroke="#57A4DE"');
		expect(svg).not.toContain('stroke="#5cc8ff"');
	});
	it("full (charging finished, still plugged in) at 100% also tints #57A4DE", () => {
		// Hardware reports "full", not "charging", once done — charging is false here.
		const svg = renderKey({ ...base, charging: false, full: true, percent: 100, chargeAccent: "#5cc8ff" });
		expect(svg).toContain('stroke="#57A4DE"');
		expect(svg).not.toContain('stroke="#5cc8ff"');
	});
	it("charging below 100% still uses the accent color, not the full-charge tint", () => {
		const svg = renderKey({ ...base, charging: true, percent: 99, chargeAccent: "#5cc8ff" });
		expect(svg).toContain('stroke="#5cc8ff"');
		expect(svg).not.toContain('stroke="#57A4DE"');
	});
	it("full below 100% does not tint (percent hasn't caught up yet)", () => {
		const svg = renderKey({ ...base, charging: false, full: true, percent: 99, chargeAccent: "#5cc8ff" });
		expect(svg).not.toContain('stroke="#57A4DE"');
		expect(svg).toContain('stroke="#e9e9ec"'); // not charging, not tinted -> white
	});
	it("escapes a quote in chargeAccent so attributes stay well-formed", () => {
		expect(renderKey({ ...base, charging: true, chargeAccent: '"onload=x' })).not.toContain('"onload=x');
	});
	it("tiers mode uses tier color", () => {
		expect(renderKey({ ...base, colorMode: "tiers", percent: 10 })).toContain("#e5484d");
	});
});
