// Raw HID++ diagnostic. Tests (1) the actual UnifiedBattery getStatus on the
// discovered feature index, and (2) whether a SECOND open/close cycle still works
// (mirrors the provider doing list() then read()). Run on Windows, mouse awake:
//   npx tsx scripts/probe-raw.ts
import * as HID from "node-hid";

const VID = 0x046d;
const PAGE = 0xff00;
const DEV = 1; // paired mouse slot found by enumeration

function hex(b: ArrayLike<number>): string {
	return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
}
function longReq(featureIndex: number, funcByte: number, params: number[] = []): number[] {
	const b = new Array(20).fill(0);
	b[0] = 0x11;
	b[1] = DEV;
	b[2] = featureIndex;
	b[3] = funcByte;
	params.forEach((p, i) => (b[4 + i] = p & 0xff));
	return b;
}

function paths(): { long: string | null; short: string | null } {
	const e = HID.devices().filter((d) => d.vendorId === VID && d.usagePage === PAGE);
	return {
		long: e.find((d) => d.usage === 2 && d.path)?.path ?? null,
		short: e.find((d) => d.usage === 1 && d.path)?.path ?? null,
	};
}

type Async = Awaited<ReturnType<(typeof HID.HIDAsync)["open"]>>;

function request(long: Async, label: string, bytes: number[]): Promise<Buffer | null> {
	return new Promise((resolve) => {
		const to = setTimeout(() => {
			long.off("data", h);
			console.log(`   ${label.padEnd(22)} <timeout>`);
			resolve(null);
		}, 800);
		const h = (d: Buffer) => {
			clearTimeout(to);
			long.off("data", h);
			console.log(`   ${label.padEnd(22)} <- ${hex(d)}`);
			resolve(d);
		};
		long.on("data", h);
		long.write(bytes).catch((e: Error) => {
			clearTimeout(to);
			long.off("data", h);
			console.log(`   ${label.padEnd(22)} write err: ${e.message}`);
			resolve(null);
		});
	});
}

async function cycle(n: number, withShort: boolean): Promise<void> {
	const p = paths();
	console.log(`\n== cycle ${n} (short handle: ${withShort && p.short ? "open" : "skipped"}) ==`);
	const long = await HID.HIDAsync.open(p.long!);
	let short: Async | null = null;
	if (withShort && p.short) {
		try {
			short = await HID.HIDAsync.open(p.short);
		} catch (e) {
			console.log(`   short open err: ${(e as Error).message}`);
		}
	}
	try {
		await request(long, "ping", longReq(0x00, 0x14, [0x00, 0x00, 0x5a]));
		const feat = await request(long, "getFeature 0x1004", longReq(0x00, 0x01, [0x10, 0x04]));
		const idx = feat ? feat[4] : 0;
		console.log(`   -> 0x1004 feature index = ${idx}`);
		if (idx) {
			await request(long, "getCapabilities fn0", longReq(idx, 0x02));
			await request(long, "getStatus fn1", longReq(idx, 0x13)); // fn1, swId 3
		}
	} finally {
		await long.close().catch(() => {});
		await short?.close().catch(() => {});
	}
}

async function main(): Promise<void> {
	const p = paths();
	console.log("long :", p.long);
	console.log("short:", p.short);
	if (!p.long) return;
	await cycle(1, true); // like list(): both collections
	await cycle(2, true); // like read() right after list(): does the 2nd open still talk?
	await cycle(3, false); // read() with ONLY the long handle (no short)
	console.log("\ndone");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
