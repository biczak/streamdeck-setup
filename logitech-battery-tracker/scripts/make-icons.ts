// Generates the plugin/category/action icons: a simple vertical-battery glyph,
// monochrome white on a transparent background, per Elgato's guidance for
// CategoryIcon and the plugin Icon (docs.elgato.com/streamdeck/sdk/references/manifest).
// Run via `npm run icons`. Does not touch the key's default image (key.png) — that's
// the actual key face, which the plugin overwrites at runtime with the colored render.
import sharp from "sharp";

// 24x24 viewBox: rounded outline body, a terminal nub on top, and a filled lower
// section suggesting charge level — all pure white, so it reads as "battery" at
// icon sizes as small as 20px while staying monochrome.
const BATTERY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="10" y="1" width="4" height="2.5" rx="1" fill="#ffffff"/>
  <rect x="7" y="4" width="10" height="17" rx="2.5" fill="none" stroke="#ffffff" stroke-width="1.8"/>
  <rect x="9" y="13.5" width="6" height="5.5" rx="1" fill="#ffffff"/>
</svg>`;

async function write(path: string, size: number): Promise<void> {
	await sharp(Buffer.from(BATTERY_ICON_SVG)).resize(size, size).png().toFile(path);
	console.log(`wrote ${path} (${size}x${size})`);
}

async function main(): Promise<void> {
	const base = "dev.biczak.logitech-battery.sdPlugin/imgs";
	await write(`${base}/plugin/marketplace.png`, 144);
	await write(`${base}/plugin/marketplace@2x.png`, 288);
	await write(`${base}/plugin/category-icon.png`, 28);
	await write(`${base}/plugin/category-icon@2x.png`, 56);
	await write(`${base}/actions/status/icon.png`, 20);
	await write(`${base}/actions/status/icon@2x.png`, 40);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
