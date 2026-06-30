// Diagnostic: enumerate Logitech HID++ interfaces, list devices, read each battery once.
// Run on Windows: `npx tsx scripts/probe.ts` (or compile). Requires node-hid installed for win32.
import * as HID from "node-hid";
import { selectHidppPaths, HidppProvider } from "../src/battery/providers/hidpp";
import { GHubProvider } from "../src/battery/providers/ghub";

async function main(): Promise<void> {
	console.log("== Logitech HID++ interfaces ==");
	for (const d of selectHidppPaths(HID.devices())) {
		console.log(`vid=${d.vendorId?.toString(16)} pid=${d.productId?.toString(16)} usage=${d.usage} iface=${d.interface} path=${d.path}`);
	}

	const hid = new HidppProvider();
	console.log("\n== HID++ provider ==", "available:", await hid.available());
	if (await hid.available()) {
		for (const dev of await hid.list()) {
			const r = await hid.read(dev.id);
			console.log(`${dev.name} (${dev.id}): ${r.state} ${r.percent}%${r.charging ? " charging" : ""}`);
		}
	}

	const ghub = new GHubProvider();
	console.log("\n== G HUB provider ==", "available:", await ghub.available());
	if (await ghub.available()) {
		for (const dev of await ghub.list()) {
			const r = await ghub.read(dev.id);
			console.log(`${dev.name} (${dev.id}): ${r.state} ${r.percent}%${r.charging ? " charging" : ""}`);
		}
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
