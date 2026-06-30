import { fillColorFor, type ColorMode, type ConnState } from "./colors";

export interface RenderInput {
	percent: number;
	state: ConnState;
	charging: boolean;
	showNumber: boolean;
	colorMode: ColorMode;
	chargeAccent: string;
}

const num = (v: number): string => String(Math.round(v * 10) / 10);

// Escape for SVG text content and double-quoted attribute values. NOTE: every attribute
// in this SVG must carry a value — SVG is XML, and a valueless attribute makes Stream
// Deck's parser blank the whole image.
function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Bold system font; Stream Deck renders SVG <text> fine once the XML is well-formed.
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/** The 144x144 battery icon — battery up top with a bold percentage below when shown,
 *  or vertically centered when the percentage is hidden. */
export function renderKey(input: RenderInput): string {
	const { state, charging, showNumber, colorMode, chargeAccent } = input;
	const percentVal = Math.max(0, Math.min(100, Math.round(input.percent)));
	const isActive = state === "active";
	const isSleep = state === "asleep";
	const isOff = state === "off";

	const accent = esc(chargeAccent);
	// Charging is shown by tinting the battery outline (body + nub) with the accent
	// color — no separate badge. White when active & not charging, grey when inactive.
	const strokeColor = !isActive ? "#5b5b62" : charging ? accent : "#e9e9ec";
	const fillColor = isActive ? fillColorFor(percentVal, colorMode) : "#54545b";
	const fillOpacity = isSleep ? 0.4 : 1;
	const numberColor = isActive ? "#f4f4f6" : isSleep ? "#83838b" : "#5b5b62";
	const label = isOff ? "—" : `${percentVal}%`;

	// Battery body is 96x46 (stroke-inset rect 93x43): high when a number is shown,
	// vertically centered otherwise.
	const bt = showNumber ? 25 : (144 - 43) / 2;
	const innerW = 82;
	const fillW = isOff ? 0 : Math.round((percentVal / 100) * innerW);

	const number = showNumber
		? `<text data-pct="1" x="72" y="117" text-anchor="middle" font-family="${FONT}" font-size="38" font-weight="700" fill="${numberColor}">${esc(label)}</text>`
		: "";

	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect x="0" y="0" width="144" height="144" rx="18" fill="#1a1a1f"/>
  <rect x="0.5" y="0.5" width="143" height="143" rx="17.5" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  <rect x="21.5" y="${num(bt)}" width="93" height="43" rx="7.5" fill="none" stroke="${strokeColor}" stroke-width="3"/>
  <path d="M118 ${num(bt + 12.5)} H121 a3 3 0 0 1 3 3 V${num(bt + 27.5)} a3 3 0 0 1 -3 3 H118 Z" fill="${strokeColor}"/>
  <rect data-fill-width="${fillW}" x="27" y="${num(bt + 5.5)}" width="${fillW}" height="32" rx="5" fill="${fillColor}" fill-opacity="${fillOpacity}"/>
  ${number}
</svg>`;
}
