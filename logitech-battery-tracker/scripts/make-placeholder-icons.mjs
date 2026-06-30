import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Minimal PNG encoder: solid RGBA square.
function crc32(buf) {
	let c = ~0;
	for (let i = 0; i < buf.length; i++) {
		c ^= buf[i];
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
}
function chunk(type, data) {
	const t = Buffer.from(type, "ascii");
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
	return Buffer.concat([len, t, data, crc]);
}
function png(size, [r, g, b, a]) {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
	const row = Buffer.alloc(1 + size * 4);
	for (let x = 0; x < size; x++) { row[1 + x * 4] = r; row[2 + x * 4] = g; row[3 + x * 4] = b; row[4 + x * 4] = a; }
	const raw = Buffer.concat(Array.from({ length: size }, () => row));
	return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function write(path, size, color) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, png(size, color));
}

const base = "dev.biczak.logitech-battery.sdPlugin/imgs";
const dark = [26, 26, 31, 255];
const accent = [70, 167, 88, 255];
// plugin + category icons
write(`${base}/plugin/marketplace.png`, 144, accent);
write(`${base}/plugin/marketplace@2x.png`, 288, accent);
write(`${base}/plugin/category-icon.png`, 28, accent);
write(`${base}/plugin/category-icon@2x.png`, 56, accent);
// action icon + default key state
write(`${base}/actions/status/icon.png`, 20, accent);
write(`${base}/actions/status/icon@2x.png`, 40, accent);
write(`${base}/actions/status/key.png`, 72, dark);
write(`${base}/actions/status/key@2x.png`, 144, dark);
console.log("placeholder icons written");
