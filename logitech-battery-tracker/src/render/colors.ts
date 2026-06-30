export type ConnState = "active" | "asleep" | "off";
export type ColorMode = "smooth" | "tiers";

// Stream Deck's SVG renderer understands only named and hex colors — not hsl()/rgb()
// functional notation (which renders as black) — so convert hue-based colors to hex.
function hslToHex(h: number, s: number, l: number): string {
	const sf = s / 100;
	const lf = l / 100;
	const a = sf * Math.min(lf, 1 - lf);
	const channel = (n: number): string => {
		const k = (n + h / 30) % 12;
		const v = lf - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(255 * v)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function fillColorFor(pct: number, mode: ColorMode): string {
	if (mode === "tiers") {
		if (pct <= 20) return "#e5484d";
		if (pct <= 55) return "#f5a524";
		return "#46a758";
	}
	const h = Math.max(0, Math.min(120, Math.round(pct * 1.2)));
	return hslToHex(h, 72, 47);
}
