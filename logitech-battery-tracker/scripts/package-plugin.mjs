// node-hid is a native module (marked `external` in rollup.config.mjs, since a compiled
// .node binary can't be bundled into plugin.js). It has to ship as a real node_modules
// folder next to plugin.js so Node can resolve it at runtime on the install machine.
// node-hid bundles prebuilt binaries for every platform (including win32) inside its own
// npm package, so no build step or cross-compilation is needed — but its package also
// contains the hidapi C source, docs, and every other platform's prebuild, none of which
// the manifest's Windows-only plugin needs, so this copies only the runtime-required
// files (per nodehid.js's own require() calls) plus its loader, pkg-prebuilds.
import { cpSync, rmSync, mkdirSync } from "node:fs";

const SD_PLUGIN = "dev.biczak.logitech-battery.sdPlugin";
const BIN_NODE_MODULES = `${SD_PLUGIN}/bin/node_modules`;

rmSync(BIN_NODE_MODULES, { recursive: true, force: true });

const HID_DIR = `${BIN_NODE_MODULES}/node-hid`;
mkdirSync(`${HID_DIR}/prebuilds/HID-win32-x64`, { recursive: true });
mkdirSync(`${HID_DIR}/prebuilds/HID-win32-arm64`, { recursive: true });
for (const file of ["package.json", "nodehid.js", "binding-options.js"]) {
	cpSync(`node_modules/node-hid/${file}`, `${HID_DIR}/${file}`);
}
for (const arch of ["HID-win32-x64", "HID-win32-arm64"]) {
	cpSync(`node_modules/node-hid/prebuilds/${arch}/node-napi-v4.node`, `${HID_DIR}/prebuilds/${arch}/node-napi-v4.node`);
}
console.log(`copied node-hid runtime files (win32-x64 + win32-arm64) -> ${HID_DIR}`);

cpSync("node_modules/pkg-prebuilds", `${BIN_NODE_MODULES}/pkg-prebuilds`, { recursive: true });
console.log(`copied node_modules/pkg-prebuilds -> ${BIN_NODE_MODULES}/pkg-prebuilds`);
