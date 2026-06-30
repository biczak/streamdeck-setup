# Logitech Battery Stream Deck Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows Elgato Stream Deck plugin whose key shows a Logitech wireless device's battery (level fill red→amber→green, charging badge, percentage), read from HID++ with a G HUB fallback.

**Architecture:** A pure SVG renderer draws the 144×144 key. A `BatteryProvider` chain (HID++ → G HUB → simulator) feeds a singleton `BatteryService` that polls each subscribed device and fans readings out to keys. A `SingletonAction` binds one key to one device and pushes the rendered SVG via `setImage`. The Property Inspector (sdpi-components) picks the device via a live `datasource` dropdown.

**Tech Stack:** TypeScript (ESM), `@elgato/streamdeck` 2.x, `@elgato/cli` 1.7.x, rollup, vitest, `node-hid` (native, HID++), `ws` (G HUB websocket). Built on WSL/Linux; installed and run on Windows.

## Global Constraints

Copied verbatim from the spec — every task inherits these:

- **Target OS:** Windows ≥ 10 only. manifest `OS` = `[{ "Platform": "windows", "MinimumVersion": "10" }]`.
- **Plugin runtime:** `Nodejs.Version: "24"`, `SDKVersion: 3`, `Software.MinimumVersion: "7.1"`. The app supplies Node; never ship a Node binary.
- **Build host Node:** ≥ 20.5.1 (host has v26 — fine). Build output is **ESM** (`bin/plugin.js` + emitted `bin/package.json` `{"type":"module"}`). Do **not** set `experimentalDecorators`/`emitDecoratorMetadata` — the SDK uses native TC39 decorators with `target: es2022`.
- **Plugin UUID:** `dev.biczak.logitech-battery`. Action UUID: `dev.biczak.logitech-battery.status`. Plugin folder: `dev.biczak.logitech-battery.sdPlugin/`.
- **Native module rule:** `node-hid` is marked `external` in rollup and listed in a second `dev.biczak.logitech-battery.sdPlugin/package.json`; its win32-x64 prebuilt is installed into `…sdPlugin/node_modules` on the Windows host.
- **Default settings:** `showNumber` true · `colorMode` `'smooth'` · `chargeAccent` `'#ffd54f'` · `pollSeconds` 60. Poll interval is user-adjustable.
- **Data source order:** HID++ (primary) → G HUB (fallback) → simulator (dev only, env-gated; production never shows fake data).
- **No remote fonts in the key SVG.** Use a system-font fallback stack now; embedded-font fidelity is a flagged risk, verified on Windows.
- **No third-party CDN scripts.** Vendor `sdpi-components.js` into `…sdPlugin/ui/` and reference it with a relative path (security: avoids CDN-compromise; also works offline). Do not use a `https://sdpi-components.dev/...` `<script src>`.
- HID++ battery-feature preference order: `0x1004` → `0x1000` → `0x1001`.

Reference: design spec `docs/superpowers/specs/2026-06-29-logitech-battery-streamdeck-design.md`; visual source of truth `docs/reference/Logitech-Battery-Key.dc.html`.

---

## File map

```
package.json                         # T1
tsconfig.json                        # T1
rollup.config.mjs                    # T1  (external: node-hid)
vitest.config.ts                     # T1
.gitignore                           # T1 (update)
scripts/make-placeholder-icons.mjs   # T1
scripts/probe.ts                     # T13
dev.biczak.logitech-battery.sdPlugin/
  manifest.json                      # T1
  package.json                       # T1  (node-hid runtime dep)
  ui/status.html                     # T12
  imgs/...                           # T1 (placeholders)
  bin/                               # build output (gitignored)
src/
  plugin.ts                          # T1, T11
  actions/battery-status.ts          # T1 (stub) → T11 (full)
  render/
    colors.ts                        # T2
    render-key.ts                    # T2
  battery/
    types.ts                         # T3
    render-input.ts                  # T3
    service.ts                       # T10
    providers/
      simulator.ts                   # T9
      ghub.ts                        # T8
      hidpp.ts                       # T7
    hidpp/
      reports.ts                     # T4
      battery.ts                     # T5
      voltage-table.ts               # T5
      enumerate.ts                   # T6
preview/
  index.html                         # T2b
  build-preview.mjs                  # T2b
```

---

### Task 1: Project scaffold — builds, validates, typechecks

**Files:**
- Create: `package.json`, `tsconfig.json`, `rollup.config.mjs`, `vitest.config.ts`
- Modify: `.gitignore`
- Create: `dev.biczak.logitech-battery.sdPlugin/manifest.json`
- Create: `dev.biczak.logitech-battery.sdPlugin/package.json`
- Create: `dev.biczak.logitech-battery.sdPlugin/ui/status.html` (minimal)
- Create: `src/plugin.ts`, `src/actions/battery-status.ts` (stub)
- Create: `scripts/make-placeholder-icons.mjs`

**Interfaces:**
- Produces: the `BatteryStatus` action class (stub) registered in `plugin.ts`; the project build pipeline.

- [ ] **Step 1: Write `package.json`**

```json
{
    "name": "logitech-battery-streamdeck",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "scripts": {
        "build": "rollup -c",
        "watch": "rollup -c -w --watch.onEnd=\"streamdeck restart dev.biczak.logitech-battery\"",
        "test": "vitest run",
        "test:watch": "vitest",
        "typecheck": "tsc --noEmit",
        "validate": "streamdeck validate dev.biczak.logitech-battery.sdPlugin",
        "icons": "node scripts/make-placeholder-icons.mjs"
    },
    "devDependencies": {
        "@elgato/cli": "^1.7.4",
        "@rollup/plugin-commonjs": "^29.0.2",
        "@rollup/plugin-json": "^6.1.0",
        "@rollup/plugin-node-resolve": "^15.2.2",
        "@rollup/plugin-terser": "^1.0.0",
        "@rollup/plugin-typescript": "^12.1.0",
        "@tsconfig/node20": "^20.1.2",
        "@types/node": "~24.1.0",
        "@types/node-hid": "^1.3.4",
        "@types/ws": "^8.5.12",
        "esbuild": "^0.24.0",
        "rollup": "^4.0.2",
        "tslib": "^2.6.2",
        "typescript": "^5.5.0",
        "vitest": "^2.1.0"
    },
    "dependencies": {
        "@elgato/streamdeck": "^2.1.0",
        "node-hid": "^3.1.2",
        "ws": "^8.18.0"
    }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
    "extends": "@tsconfig/node20/tsconfig.json",
    "compilerOptions": {
        "customConditions": ["node"],
        "module": "ES2022",
        "moduleResolution": "Bundler",
        "noImplicitOverride": true,
        "types": ["node"]
    },
    "include": ["src/**/*.ts", "scripts/**/*.ts"],
    "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `rollup.config.mjs`** (note `external: ["node-hid"]`, `json()`, `ignoreDynamicRequires`)

```js
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "dev.biczak.logitech-battery.sdPlugin";

/** @type {import('rollup').RollupOptions} */
const config = {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (rel, mapPath) =>
			url.pathToFileURL(path.resolve(path.dirname(mapPath), rel)).href,
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart() {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		typescript({ mapRoot: isWatching ? "./" : undefined }),
		nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
		commonjs({ ignoreDynamicRequires: true }),
		json(),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			},
		},
	],
	external: ["node-hid"],
};

export default config;
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
	},
});
```

- [ ] **Step 5: Update `.gitignore`**

```gitignore
node_modules/
*.log
.DS_Store
*.sdPlugin/bin
*.sdPlugin/logs
*.sdPlugin/node_modules
preview/render-key.mjs
```

- [ ] **Step 6: Write the manifest** `dev.biczak.logitech-battery.sdPlugin/manifest.json`

```json
{
    "$schema": "https://schemas.elgato.com/streamdeck/plugins/manifest.json",
    "Name": "Logitech Battery",
    "Version": "0.1.0.0",
    "Author": "Alex Biczak",
    "Description": "Show a Logitech wireless device's battery level on a key.",
    "Icon": "imgs/plugin/marketplace",
    "Category": "Logitech Battery",
    "CategoryIcon": "imgs/plugin/category-icon",
    "CodePath": "bin/plugin.js",
    "UUID": "dev.biczak.logitech-battery",
    "SDKVersion": 3,
    "Software": { "MinimumVersion": "7.1" },
    "Nodejs": { "Version": "24", "Debug": "enabled" },
    "OS": [{ "Platform": "windows", "MinimumVersion": "10" }],
    "Actions": [
        {
            "Name": "Battery Status",
            "UUID": "dev.biczak.logitech-battery.status",
            "Icon": "imgs/actions/status/icon",
            "Tooltip": "Show a Logitech device's battery level.",
            "PropertyInspectorPath": "ui/status.html",
            "Controllers": ["Keypad"],
            "States": [{ "Image": "imgs/actions/status/key", "TitleAlignment": "middle" }]
        }
    ]
}
```

- [ ] **Step 7: Write the runtime `package.json`** `dev.biczak.logitech-battery.sdPlugin/package.json`

```json
{
    "dependencies": {
        "node-hid": "^3.1.2"
    }
}
```

- [ ] **Step 8: Vendor `sdpi-components.js` locally** (security: no CDN at runtime; also enables offline PI)

Run:
```bash
mkdir -p dev.biczak.logitech-battery.sdPlugin/ui
curl -fsSL https://sdpi-components.dev/releases/v4/sdpi-components.js \
  -o dev.biczak.logitech-battery.sdPlugin/ui/sdpi-components.js
```
Expected: `ui/sdpi-components.js` exists and is non-empty. This file is committed (vendored), not gitignored.

- [ ] **Step 9: Write the minimal Property Inspector** `dev.biczak.logitech-battery.sdPlugin/ui/status.html` (replaced fully in T12)

```html
<!DOCTYPE html>
<html>
<head lang="en">
    <title>Battery Status Settings</title>
    <meta charset="utf-8" />
    <script src="sdpi-components.js"></script>
</head>
<body>
    <sdpi-item label="Device">
        <sdpi-select setting="deviceId" datasource="getDevices" placeholder="Detecting devices…"></sdpi-select>
    </sdpi-item>
</body>
</html>
```

- [ ] **Step 10: Write `src/plugin.ts`**

```ts
import streamDeck from "@elgato/streamdeck";
import { BatteryStatus } from "./actions/battery-status";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new BatteryStatus());
streamDeck.connect();
```

- [ ] **Step 11: Write the stub action** `src/actions/battery-status.ts`

```ts
import { action, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

type Settings = { deviceId?: string };

@action({ UUID: "dev.biczak.logitech-battery.status" })
export class BatteryStatus extends SingletonAction<Settings> {
	override onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		return ev.action.setTitle("—");
	}
}
```

- [ ] **Step 12: Write `scripts/make-placeholder-icons.mjs`** (dependency-free solid-color PNG writer)

```js
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
```

- [ ] **Step 13: Install, generate icons, build, validate, typecheck**

Run:
```bash
npm install
npm run icons
npm run build
npm run validate
npm run typecheck
```
Expected: install succeeds; `npm run build` writes `dev.biczak.logitech-battery.sdPlugin/bin/plugin.js`; `npm run validate` reports the plugin is valid (no errors); `npm run typecheck` exits 0.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "chore: scaffold Stream Deck plugin (builds, validates, typechecks)"
```

---

### Task 2: Key colors + SVG renderer (pure)

**Files:**
- Create: `src/render/colors.ts`, `src/render/colors.test.ts`
- Create: `src/render/render-key.ts`, `src/render/render-key.test.ts`

**Interfaces:**
- Produces:
  - `type ConnState = 'active' | 'asleep' | 'off'`
  - `type ColorMode = 'smooth' | 'tiers'`
  - `fillColorFor(pct: number, mode: ColorMode): string`
  - `interface RenderInput { percent: number; state: ConnState; charging: boolean; showNumber: boolean; colorMode: ColorMode; chargeAccent: string }`
  - `renderKey(input: RenderInput): string` → 144×144 SVG string

- [ ] **Step 1: Write the failing color test** `src/render/colors.test.ts`

```ts
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
	it("smooth: hue scales 0..120 and clamps", () => {
		expect(fillColorFor(0, "smooth")).toBe("hsl(0 72% 47%)");
		expect(fillColorFor(72, "smooth")).toBe("hsl(86 72% 47%)");
		expect(fillColorFor(100, "smooth")).toBe("hsl(120 72% 47%)");
		expect(fillColorFor(200, "smooth")).toBe("hsl(120 72% 47%)");
	});
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/render/colors.test.ts`
Expected: FAIL (`fillColorFor` / module not found).

- [ ] **Step 3: Implement** `src/render/colors.ts`

```ts
export type ConnState = "active" | "asleep" | "off";
export type ColorMode = "smooth" | "tiers";

export function fillColorFor(pct: number, mode: ColorMode): string {
	if (mode === "tiers") {
		if (pct <= 20) return "#e5484d";
		if (pct <= 55) return "#f5a524";
		return "#46a758";
	}
	const h = Math.max(0, Math.min(120, Math.round(pct * 1.2)));
	return `hsl(${h} 72% 47%)`;
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run src/render/colors.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing renderer test** `src/render/render-key.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { renderKey, type RenderInput } from "./render-key";

const base: RenderInput = {
	percent: 72, state: "active", charging: false,
	showNumber: true, colorMode: "smooth", chargeAccent: "#ffd54f",
};

describe("renderKey", () => {
	it("returns a 144x144 svg", () => {
		const svg = renderKey(base);
		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg).toContain('width="144"');
		expect(svg).toContain('height="144"');
	});
	it("active: stroke light, fill uses smooth color, shows percent", () => {
		const svg = renderKey(base);
		expect(svg).toContain("#e9e9ec");          // stroke when active
		expect(svg).toContain("hsl(86 72% 47%)");  // smooth fill at 72
		expect(svg).toContain(">72%<");
	});
	it("off: empty fill, em-dash, dim number", () => {
		const svg = renderKey({ ...base, state: "off" });
		expect(svg).toContain('data-fill-width="0"');
		expect(svg).toContain(">—<");
		expect(svg).toContain("#5b5b62");           // off stroke + number color
	});
	it("asleep: fill opacity 0.4 and dim number", () => {
		const svg = renderKey({ ...base, state: "asleep" });
		expect(svg).toContain('fill-opacity="0.4"');
		expect(svg).toContain("#83838b");
	});
	it("charging badge present only when active and charging", () => {
		expect(renderKey({ ...base, charging: true })).toContain("data-badge");
		expect(renderKey({ ...base, charging: false })).not.toContain("data-badge");
		expect(renderKey({ ...base, charging: true, state: "asleep" })).not.toContain("data-badge");
	});
	it("hides the number when showNumber is false", () => {
		expect(renderKey({ ...base, showNumber: false })).not.toContain("data-pct");
	});
	it("tiers mode uses tier color", () => {
		expect(renderKey({ ...base, colorMode: "tiers", percent: 10 })).toContain("#e5484d");
	});
});
```

- [ ] **Step 6: Run it — expect failure**

Run: `npx vitest run src/render/render-key.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement** `src/render/render-key.ts`

```ts
import { fillColorFor, type ColorMode, type ConnState } from "./colors";

export interface RenderInput {
	percent: number;
	state: ConnState;
	charging: boolean;
	showNumber: boolean;
	colorMode: ColorMode;
	chargeAccent: string;
}

const FONT = "'Space Grotesk','Segoe UI',system-ui,sans-serif";

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderKey(input: RenderInput): string {
	const { state, charging, showNumber, colorMode, chargeAccent } = input;
	const percent = Math.max(0, Math.min(100, Math.round(input.percent)));
	const isActive = state === "active";
	const isSleep = state === "asleep";
	const isOff = state === "off";

	const strokeColor = isActive ? "#e9e9ec" : "#5b5b62";
	const fillColor = isActive ? fillColorFor(percent, colorMode) : "#54545b";
	const fillOpacity = isSleep ? 0.4 : 1;
	const numberColor = isActive ? "#f4f4f6" : isSleep ? "#83838b" : "#5b5b62";
	const pctLabel = isOff ? "—" : `${percent}%`;

	// Battery geometry (from docs/reference prototype, box-sizing: border-box).
	// Body outer 96x46 @ (20,38); 3px stroke inset; 4px padding; inner 82x32 @ (27,45).
	const innerW = 82;
	const fillW = isOff ? 0 : Math.round((percent / 100) * innerW);

	const badge =
		isActive && charging
			? `<g data-badge>
    <circle cx="72" cy="23" r="10" fill="#16161a" stroke="${chargeAccent}" stroke-width="2"/>
    <g transform="translate(67 16.5) scale(0.714 0.722)">
      <polygon points="8,0 0,10 5,10 4,18 14,7 8,7" fill="${chargeAccent}"/>
    </g>
  </g>`
			: "";

	const number = showNumber
		? `<text data-pct x="72" y="121" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="0.5" fill="${numberColor}">${esc(pctLabel)}</text>`
		: "";

	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect x="0" y="0" width="144" height="144" rx="18" fill="#1a1a1f"/>
  <rect x="0.5" y="0.5" width="143" height="143" rx="17.5" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  <rect x="21.5" y="39.5" width="93" height="43" rx="7.5" fill="none" stroke="${strokeColor}" stroke-width="3"/>
  <path d="M118 52 H121 a3 3 0 0 1 3 3 V67 a3 3 0 0 1 -3 3 H118 Z" fill="${strokeColor}"/>
  <rect data-fill-width="${fillW}" x="27" y="45" width="${fillW}" height="32" rx="5" fill="${fillColor}" fill-opacity="${fillOpacity}"/>
  ${badge}
  ${number}
</svg>`;
}
```

- [ ] **Step 8: Run it — expect pass**

Run: `npx vitest run src/render/render-key.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/render
git commit -m "feat: pure SVG key renderer with state/color/charging variants"
```

---

### Task 2b: Browser preview harness + visual parity check

**Files:**
- Create: `preview/build-preview.mjs`, `preview/index.html`
- Modify: `package.json` (add `preview` script)

**Interfaces:**
- Consumes: `renderKey`, `RenderInput` (T2).
- Produces: a static `preview/index.html` that imports the bundled real renderer — used only for visual verification, not shipped.

- [ ] **Step 1: Add the preview build script** `preview/build-preview.mjs`

```js
import { build } from "esbuild";

await build({
	entryPoints: ["src/render/render-key.ts"],
	bundle: true,
	format: "esm",
	outfile: "preview/render-key.mjs",
});
console.log("preview/render-key.mjs built");
```

- [ ] **Step 2: Add the `preview` npm script** (in `package.json` `scripts`, after `icons`)

```json
        "preview": "node preview/build-preview.mjs"
```

- [ ] **Step 3: Write the harness** `preview/index.html` (reproduces the prototype controls, drives the real renderer)

```html
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Battery Key preview</title>
	<style>
		body { margin: 0; min-height: 100vh; background: radial-gradient(120% 120% at 50% 0%, #161619 0%, #0c0c0e 60%);
			color: #e9e9ec; font-family: system-ui, sans-serif; display: flex; flex-direction: column;
			align-items: center; padding: 56px 24px; gap: 18px; }
		.stage { width: 288px; height: 288px; display: flex; align-items: center; justify-content: center; }
		.stage > div { transform: scale(2); transform-origin: center; }
		.panel { width: 340px; background: #161619; border: 1px solid #26262c; border-radius: 16px; padding: 22px;
			display: flex; flex-direction: column; gap: 16px; }
		label { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #7a7a82; }
		.row { display: flex; gap: 8px; align-items: center; }
	</style>
</head>
<body>
	<div class="stage"><div id="key"></div></div>
	<div class="panel">
		<div><label>Battery <span id="pctval">72%</span></label><input id="pct" type="range" min="0" max="100" value="72" style="width:100%"></div>
		<div class="row"><label>State</label>
			<select id="state"><option value="active">active</option><option value="asleep">asleep</option><option value="off">off</option></select>
			<label><input id="charging" type="checkbox"> charging</label></div>
		<div class="row"><label>Mode</label>
			<select id="mode"><option value="smooth">smooth</option><option value="tiers">tiers</option></select>
			<label><input id="shownum" type="checkbox" checked> number</label>
			<input id="accent" type="color" value="#ffd54f"></div>
	</div>
	<script type="module">
		import { renderKey } from "./render-key.mjs";
		const $ = (id) => document.getElementById(id);
		function draw() {
			$("pctval").textContent = $("pct").value + "%";
			$("key").innerHTML = renderKey({
				percent: Number($("pct").value),
				state: $("state").value,
				charging: $("charging").checked,
				showNumber: $("shownum").checked,
				colorMode: $("mode").value,
				chargeAccent: $("accent").value,
			});
		}
		for (const id of ["pct", "state", "charging", "mode", "shownum", "accent"]) $(id).addEventListener("input", draw);
		draw();
	</script>
</body>
</html>
```

- [ ] **Step 4: Build the preview bundle**

Run: `npm run preview`
Expected: `preview/render-key.mjs` is written.

- [ ] **Step 5: Visual verification (browser MCP)**

Open `preview/index.html` in a browser (e.g. via the chrome-devtools or playwright MCP), screenshot the default (72%, active, smooth) and compare against `docs/reference/Logitech-Battery-Key.dc.html`. Toggle each control (off → em-dash + empty; asleep → dim; charging → badge; tiers; hide number) and confirm parity. Note any geometry/font offsets and adjust `render-key.ts` constants (then re-run T2 tests + `npm run preview`).
Expected: rendered key visually matches the prototype across all states.

- [ ] **Step 6: Commit**

```bash
git add preview package.json
git commit -m "test: browser preview harness for visual parity"
```

---

### Task 3: Battery types + reading→render-input mapper

**Files:**
- Create: `src/battery/types.ts`
- Create: `src/battery/render-input.ts`, `src/battery/render-input.test.ts`

**Interfaces:**
- Consumes: `RenderInput` (T2), `ConnState`/`ColorMode` (T2).
- Produces:
  - `interface BatteryReading { deviceId: string; name: string; percent: number; state: ConnState; charging: boolean }`
  - `interface DeviceInfo { id: string; name: string; kind?: string; source: ProviderSource }`
  - `type ProviderSource = 'hidpp' | 'ghub' | 'simulator'`
  - `interface BatteryProvider { readonly source: ProviderSource; available(): Promise<boolean>; list(): Promise<DeviceInfo[]>; read(deviceId: string): Promise<BatteryReading> }`
  - `interface KeySettings { deviceId?: string; showNumber?: boolean; colorMode?: ColorMode; chargeAccent?: string; pollSeconds?: number }`
  - `readingToRenderInput(reading: BatteryReading | null, settings: KeySettings): RenderInput`

- [ ] **Step 1: Write `src/battery/types.ts`**

```ts
import type { ColorMode, ConnState } from "../render/colors";

export type ProviderSource = "hidpp" | "ghub" | "simulator";

export interface BatteryReading {
	deviceId: string;
	name: string;
	percent: number; // 0..100; last-known when state is "asleep"
	state: ConnState;
	charging: boolean;
}

export interface DeviceInfo {
	id: string; // "<source>:<...>" — routable back to its provider
	name: string;
	kind?: string;
	source: ProviderSource;
}

export interface BatteryProvider {
	readonly source: ProviderSource;
	available(): Promise<boolean>;
	list(): Promise<DeviceInfo[]>;
	read(deviceId: string): Promise<BatteryReading>;
}

export interface KeySettings {
	deviceId?: string;
	showNumber?: boolean;
	colorMode?: ColorMode;
	chargeAccent?: string;
	pollSeconds?: number;
}

export const DEFAULT_SETTINGS: Required<Omit<KeySettings, "deviceId">> = {
	showNumber: true,
	colorMode: "smooth",
	chargeAccent: "#ffd54f",
	pollSeconds: 60,
};
```

- [ ] **Step 2: Write the failing mapper test** `src/battery/render-input.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readingToRenderInput } from "./render-input";
import type { BatteryReading } from "./types";

const reading: BatteryReading = { deviceId: "hidpp:1", name: "Mouse", percent: 72, state: "active", charging: true };

describe("readingToRenderInput", () => {
	it("applies defaults when settings are empty", () => {
		const ri = readingToRenderInput(reading, {});
		expect(ri).toMatchObject({ percent: 72, state: "active", charging: true, showNumber: true, colorMode: "smooth", chargeAccent: "#ffd54f" });
	});
	it("honors explicit settings", () => {
		const ri = readingToRenderInput(reading, { showNumber: false, colorMode: "tiers", chargeAccent: "#5cc8ff" });
		expect(ri).toMatchObject({ showNumber: false, colorMode: "tiers", chargeAccent: "#5cc8ff" });
	});
	it("maps a null reading (no device) to the off state at 0%", () => {
		const ri = readingToRenderInput(null, {});
		expect(ri).toMatchObject({ state: "off", percent: 0, charging: false });
	});
});
```

- [ ] **Step 3: Run it — expect failure**

Run: `npx vitest run src/battery/render-input.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement** `src/battery/render-input.ts`

```ts
import type { RenderInput } from "../render/render-key";
import { DEFAULT_SETTINGS, type BatteryReading, type KeySettings } from "./types";

export function readingToRenderInput(reading: BatteryReading | null, settings: KeySettings): RenderInput {
	return {
		percent: reading?.percent ?? 0,
		state: reading?.state ?? "off",
		charging: reading?.charging ?? false,
		showNumber: settings.showNumber ?? DEFAULT_SETTINGS.showNumber,
		colorMode: settings.colorMode ?? DEFAULT_SETTINGS.colorMode,
		chargeAccent: settings.chargeAccent ?? DEFAULT_SETTINGS.chargeAccent,
	};
}
```

- [ ] **Step 5: Run it — expect pass**

Run: `npx vitest run src/battery/render-input.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/battery/types.ts src/battery/render-input.ts src/battery/render-input.test.ts
git commit -m "feat: battery types + reading-to-render-input mapper"
```

---

### Task 4: HID++ report encode + response parse (pure)

**Files:**
- Create: `src/battery/hidpp/reports.ts`, `src/battery/hidpp/reports.test.ts`

**Interfaces:**
- Produces:
  - constants `HIDPP_SHORT=0x10`, `HIDPP_LONG=0x11`, `SHORT_LEN=7`, `LONG_LEN=20`, `SW_ID=0x0a`, `RECEIVER_INDEX=0xff`, `IROOT_INDEX=0x00`
  - `funcByte(fn: number, swId?: number): number`
  - `buildLongRequest(deviceIndex, featureIndex, fn, params?): Buffer`
  - `buildShortRequest(deviceIndex, subId, address, params?): Buffer`
  - `interface ParsedResponse { reportId; deviceIndex; featureIndex; funcByte; swId; params: Buffer; isError: boolean; errorCode?: number; kind: 'feature'|'error'|'notification' }`
  - `parseResponse(buf: Buffer): ParsedResponse`
  - `matches(req: Buffer, res: ParsedResponse): boolean`

- [ ] **Step 1: Write the failing test** `src/battery/hidpp/reports.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildLongRequest, buildShortRequest, funcByte, parseResponse, SW_ID } from "./reports";

describe("hidpp reports", () => {
	it("packs funcByte as (fn<<4)|swId", () => {
		expect(funcByte(0)).toBe(SW_ID);
		expect(funcByte(1)).toBe((1 << 4) | SW_ID);
	});
	it("builds a 20-byte long request", () => {
		const b = buildLongRequest(0x01, 0x05, 1, [0x10, 0x04]);
		expect(b.length).toBe(20);
		expect([b[0], b[1], b[2], b[3], b[4], b[5]]).toEqual([0x11, 0x01, 0x05, (1 << 4) | SW_ID, 0x10, 0x04]);
	});
	it("builds a 7-byte short request", () => {
		const b = buildShortRequest(0xff, 0x83, 0xb5, [0x03]);
		expect(b.length).toBe(7);
		expect([b[0], b[1], b[2], b[3], b[4]]).toEqual([0x10, 0xff, 0x83, 0xb5, 0x03]);
	});
	it("parses a feature response", () => {
		const r = parseResponse(Buffer.from([0x11, 0x01, 0x05, (1 << 4) | SW_ID, 0x48, 0x01, 0x00]));
		expect(r.isError).toBe(false);
		expect(r.kind).toBe("feature");
		expect(r.featureIndex).toBe(0x05);
		expect(r.params[0]).toBe(0x48);
	});
	it("parses a HID++ 1.0 error (0x8f) as device-unreachable code 0x09", () => {
		const r = parseResponse(Buffer.from([0x10, 0x01, 0x8f, 0x83, 0x09, 0x00, 0x00]));
		expect(r.isError).toBe(true);
		expect(r.errorCode).toBe(0x09);
	});
	it("parses a HID++ 2.0 error (0xff) with code at byte 5", () => {
		const r = parseResponse(Buffer.from([0x11, 0x01, 0xff, 0x05, (1 << 4) | SW_ID, 0x09, 0x00]));
		expect(r.isError).toBe(true);
		expect(r.errorCode).toBe(0x09);
	});
	it("flags spontaneous notifications (swId 0)", () => {
		const r = parseResponse(Buffer.from([0x11, 0x01, 0x05, 0x00, 0x00, 0x00, 0x00]));
		expect(r.kind).toBe("notification");
	});
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/battery/hidpp/reports.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/battery/hidpp/reports.ts`

```ts
export const HIDPP_SHORT = 0x10;
export const HIDPP_LONG = 0x11;
export const SHORT_LEN = 7;
export const LONG_LEN = 20;
export const SW_ID = 0x0a;
export const RECEIVER_INDEX = 0xff;
export const IROOT_INDEX = 0x00;

const ERR_SHORT_SUBID = 0x8f; // HID++ 1.0 error report
const ERR_LONG_FEATURE = 0xff; // HID++ 2.0 error report

export function funcByte(fn: number, swId: number = SW_ID): number {
	return ((fn & 0x0f) << 4) | (swId & 0x0f);
}

export function buildLongRequest(deviceIndex: number, featureIndex: number, fn: number, params: number[] = []): Buffer {
	const buf = Buffer.alloc(LONG_LEN);
	buf[0] = HIDPP_LONG;
	buf[1] = deviceIndex;
	buf[2] = featureIndex;
	buf[3] = funcByte(fn);
	for (let i = 0; i < params.length && i < 16; i++) buf[4 + i] = params[i] & 0xff;
	return buf;
}

export function buildShortRequest(deviceIndex: number, subId: number, address: number, params: number[] = []): Buffer {
	const buf = Buffer.alloc(SHORT_LEN);
	buf[0] = HIDPP_SHORT;
	buf[1] = deviceIndex;
	buf[2] = subId;
	buf[3] = address;
	for (let i = 0; i < params.length && i < 3; i++) buf[4 + i] = params[i] & 0xff;
	return buf;
}

export interface ParsedResponse {
	reportId: number;
	deviceIndex: number;
	featureIndex: number;
	funcByte: number;
	swId: number;
	params: Buffer;
	isError: boolean;
	errorCode?: number;
	kind: "feature" | "error" | "notification";
}

export function parseResponse(buf: Buffer): ParsedResponse {
	const reportId = buf[0];
	const deviceIndex = buf[1];
	if (buf[2] === ERR_SHORT_SUBID) {
		return { reportId, deviceIndex, featureIndex: buf[3], funcByte: 0, swId: 0, params: buf.subarray(4), isError: true, errorCode: buf[4], kind: "error" };
	}
	if (buf[2] === ERR_LONG_FEATURE) {
		return { reportId, deviceIndex, featureIndex: buf[3], funcByte: buf[4], swId: buf[4] & 0x0f, params: buf.subarray(5), isError: true, errorCode: buf[5], kind: "error" };
	}
	const fByte = buf[3];
	const swId = fByte & 0x0f;
	return { reportId, deviceIndex, featureIndex: buf[2], funcByte: fByte, swId, params: buf.subarray(4), isError: false, errorCode: undefined, kind: swId === 0 ? "notification" : "feature" };
}

/** True when a response corresponds to a request we sent (same device + feature/sub + our swId). */
export function matches(req: Buffer, res: ParsedResponse): boolean {
	if (res.deviceIndex !== req[1]) return false;
	if (res.isError) return res.featureIndex === req[2] || res.featureIndex === req[3];
	return res.featureIndex === req[2] && res.swId === (req[3] & 0x0f);
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run src/battery/hidpp/reports.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/battery/hidpp/reports.ts src/battery/hidpp/reports.test.ts
git commit -m "feat: HID++ report encode/parse with error + notification handling"
```

---

### Task 5: Battery-feature parsing + voltage table (pure)

**Files:**
- Create: `src/battery/hidpp/voltage-table.ts`, `src/battery/hidpp/voltage-table.test.ts`
- Create: `src/battery/hidpp/battery.ts`, `src/battery/hidpp/battery.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (operates on raw param `Buffer`s).
- Produces:
  - `FEATURE_IROOT=0x0000`, `FEATURE_UNIFIED_BATTERY=0x1004`, `FEATURE_BATTERY_STATUS=0x1000`, `FEATURE_BATTERY_VOLTAGE=0x1001`
  - `interface BatteryParse { percent: number; charging: boolean; full: boolean }`
  - `parseUnified1004(params: Buffer): BatteryParse`
  - `parseStatus1000(params: Buffer): BatteryParse`
  - `parseVoltage1001(params: Buffer): BatteryParse`
  - `voltageToPercent(mV: number): number`

- [ ] **Step 1: Write the failing voltage test** `src/battery/hidpp/voltage-table.test.ts`

```ts
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
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/battery/hidpp/voltage-table.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/battery/hidpp/voltage-table.ts`

```ts
// Approximate Li-ion discharge curve (mV -> %). The 0x1001 voltage feature has no
// exact public formula; the Linux kernel uses a 100-point lookup table. This anchor
// table is a monotonic approximation; for higher precision, replace with the kernel
// table from drivers/hid/hid-logitech-hidpp.c. Voltage is the last-resort feature.
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
	[4186, 100], [4060, 90], [3980, 80], [3920, 70], [3870, 60],
	[3820, 50], [3790, 40], [3730, 30], [3680, 20], [3610, 10],
	[3550, 1], [3500, 0],
];

export function voltageToPercent(mV: number): number {
	if (mV >= ANCHORS[0][0]) return 100;
	if (mV <= ANCHORS[ANCHORS.length - 1][0]) return 0;
	for (let i = 0; i < ANCHORS.length - 1; i++) {
		const [vHi, pHi] = ANCHORS[i];
		const [vLo, pLo] = ANCHORS[i + 1];
		if (mV <= vHi && mV >= vLo) {
			const t = (mV - vLo) / (vHi - vLo);
			return Math.round(pLo + t * (pHi - pLo));
		}
	}
	return 0;
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run src/battery/hidpp/voltage-table.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing battery-parse test** `src/battery/hidpp/battery.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseUnified1004, parseStatus1000, parseVoltage1001 } from "./battery";

describe("battery feature parsing", () => {
	it("0x1004: percent in p0, charging status in p2", () => {
		expect(parseUnified1004(Buffer.from([72, 0x04, 1, 0]))).toEqual({ percent: 72, charging: true, full: false });
		expect(parseUnified1004(Buffer.from([100, 0x08, 3, 0]))).toEqual({ percent: 100, charging: false, full: true });
		expect(parseUnified1004(Buffer.from([50, 0x04, 0, 0]))).toEqual({ percent: 50, charging: false, full: false });
	});
	it("0x1000: percent in p0, status in p2", () => {
		expect(parseStatus1000(Buffer.from([55, 60, 0]))).toEqual({ percent: 55, charging: false, full: false });
		expect(parseStatus1000(Buffer.from([90, 100, 1]))).toEqual({ percent: 90, charging: true, full: false });
		expect(parseStatus1000(Buffer.from([100, 100, 3]))).toEqual({ percent: 100, charging: false, full: true });
	});
	it("0x1001: be16 mV + charging flag bit7", () => {
		const dischargeFull = parseVoltage1001(Buffer.from([0x10, 0x5a, 0x00])); // 4186 mV, discharging
		expect(dischargeFull.percent).toBe(100);
		expect(dischargeFull.charging).toBe(false);
		const charging = parseVoltage1001(Buffer.from([0x0f, 0x00, 0x80])); // bit7 set, low bits 0 => charging
		expect(charging.charging).toBe(true);
	});
});
```

- [ ] **Step 6: Run it — expect failure**

Run: `npx vitest run src/battery/hidpp/battery.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement** `src/battery/hidpp/battery.ts`

```ts
import { voltageToPercent } from "./voltage-table";

export const FEATURE_IROOT = 0x0000;
export const FEATURE_UNIFIED_BATTERY = 0x1004;
export const FEATURE_BATTERY_STATUS = 0x1000;
export const FEATURE_BATTERY_VOLTAGE = 0x1001;

export interface BatteryParse {
	percent: number;
	charging: boolean;
	full: boolean;
}

// 0x1004 UnifiedBattery getStatus: p0=state-of-charge %, p2=charging status
// (0 discharging, 1 charging, 2 charging slow, 3 full, 4 error).
export function parseUnified1004(params: Buffer): BatteryParse {
	const status = params[2];
	return { percent: params[0], charging: status === 1 || status === 2, full: status === 3 };
}

// 0x1000 getBatteryLevelStatus: p0=capacity %, p2=status
// (0 discharging, 1 recharging, 2 near complete, 3 complete, 4 below optimal, ...).
export function parseStatus1000(params: Buffer): BatteryParse {
	const status = params[2];
	return { percent: params[0], charging: status === 1 || status === 2 || status === 4, full: status === 3 };
}

// 0x1001 getBatteryVoltage: be16 mV in p0..p1, flags in p2.
// flags bit7 set => charging family (low 3 bits: 0 charging, 1 full, 2 not charging).
export function parseVoltage1001(params: Buffer): BatteryParse {
	const mV = (params[0] << 8) | params[1];
	const flags = params[2];
	const chargingFamily = (flags & 0x80) !== 0;
	const low = flags & 0x07;
	return { percent: voltageToPercent(mV), charging: chargingFamily && low === 0, full: chargingFamily && low === 1 };
}
```

- [ ] **Step 8: Run it — expect pass**

Run: `npx vitest run src/battery/hidpp/battery.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/battery/hidpp/voltage-table.ts src/battery/hidpp/voltage-table.test.ts src/battery/hidpp/battery.ts src/battery/hidpp/battery.test.ts
git commit -m "feat: HID++ battery-feature parsing (0x1004/0x1000/0x1001) + voltage table"
```

---

### Task 6: HID++ receiver enumeration parsing (pure)

**Files:**
- Create: `src/battery/hidpp/enumerate.ts`, `src/battery/hidpp/enumerate.test.ts`

**Interfaces:**
- Consumes: `buildShortRequest` (T4).
- Produces:
  - `REG_PAIRING_INFO=0xb5`, `SUBID_GET_LONG=0x83`
  - `buildPairingInfoRequest(n: number): Buffer` (n = 1..6)
  - `buildDeviceNameRequest(n: number): Buffer`
  - `parsePairingInfo(params: Buffer): { wpid: number; kind: number; kindName: string }`
  - `parseDeviceName(params: Buffer): string`
  - `KIND_NAMES: Record<number, string>`

- [ ] **Step 1: Write the failing test** `src/battery/hidpp/enumerate.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildPairingInfoRequest, buildDeviceNameRequest, parsePairingInfo, parseDeviceName } from "./enumerate";

describe("hidpp enumeration", () => {
	it("pairing-info request targets register 0xb5 sub 0x20+(n-1) on the receiver", () => {
		const b = buildPairingInfoRequest(1);
		expect([b[0], b[1], b[2], b[3], b[4]]).toEqual([0x10, 0xff, 0x83, 0xb5, 0x20]);
		expect(buildPairingInfoRequest(3)[4]).toBe(0x22);
	});
	it("device-name request uses sub 0x40+(n-1)", () => {
		expect(buildDeviceNameRequest(1)[4]).toBe(0x40);
		expect(buildDeviceNameRequest(2)[4]).toBe(0x41);
	});
	it("parses WPID and device kind", () => {
		// params: [echoSub, ?, ?, wpidHi, wpidLo, ?, ?, kindNibble, ...]
		const params = Buffer.alloc(16);
		params[3] = 0x40; params[4] = 0x7a; // WPID 0x407a
		params[7] = 0x02; // mouse
		const r = parsePairingInfo(params);
		expect(r.wpid).toBe(0x407a);
		expect(r.kind).toBe(2);
		expect(r.kindName).toBe("mouse");
	});
	it("parses an ASCII codename", () => {
		const name = "K780";
		const params = Buffer.alloc(16);
		params[1] = name.length;
		Buffer.from(name, "ascii").copy(params, 2);
		expect(parseDeviceName(params)).toBe("K780");
	});
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/battery/hidpp/enumerate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/battery/hidpp/enumerate.ts`

```ts
import { buildShortRequest, RECEIVER_INDEX } from "./reports";

export const REG_PAIRING_INFO = 0xb5;
export const SUBID_GET_LONG = 0x83;

export const KIND_NAMES: Record<number, string> = {
	1: "keyboard", 2: "mouse", 3: "numpad", 4: "presenter",
	8: "trackball", 9: "touchpad", 0xa: "tablet", 0xb: "gamepad", 0xd: "headset",
};

// Pairing info for paired device n (1..6): register 0xB5, sub-register 0x20+(n-1).
export function buildPairingInfoRequest(n: number): Buffer {
	return buildShortRequest(RECEIVER_INDEX, SUBID_GET_LONG, REG_PAIRING_INFO, [0x20 + (n - 1)]);
}

// Device codename for paired device n: register 0xB5, sub-register 0x40+(n-1).
export function buildDeviceNameRequest(n: number): Buffer {
	return buildShortRequest(RECEIVER_INDEX, SUBID_GET_LONG, REG_PAIRING_INFO, [0x40 + (n - 1)]);
}

// params = 16 data bytes of the long-register read response (offsets per Solaar/kernel).
export function parsePairingInfo(params: Buffer): { wpid: number; kind: number; kindName: string } {
	const wpid = (params[3] << 8) | params[4];
	const kind = params[7] & 0x0f;
	return { wpid, kind, kindName: KIND_NAMES[kind] ?? "device" };
}

export function parseDeviceName(params: Buffer): string {
	const len = params[1];
	return params.subarray(2, 2 + len).toString("ascii").replace(/\0+$/, "");
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run src/battery/hidpp/enumerate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/battery/hidpp/enumerate.ts src/battery/hidpp/enumerate.test.ts
git commit -m "feat: HID++ receiver pairing-info + device-name parsing"
```

---

### Task 7: HID++ provider (node-hid transport)

**Files:**
- Create: `src/battery/providers/hidpp.ts`, `src/battery/providers/hidpp.test.ts`

**Interfaces:**
- Consumes: `BatteryProvider`, `BatteryReading`, `DeviceInfo` (T3); all of `hidpp/` (T4–T6).
- Produces:
  - `selectHidppPaths(devices: HidDeviceInfo[]): HidDeviceInfo[]` (pure; unit-tested)
  - `class HidppProvider implements BatteryProvider`
  - `LOGITECH_VID = 0x046d`, `HIDPP_USAGE_PAGE = 0xff00`

Real device reads are verified on Windows via `scripts/probe.ts` (T13); the unit test here covers only the pure `selectHidppPaths` selection logic (node-hid cannot open a Logitech device in CI/WSL).

- [ ] **Step 1: Write the failing selection test** `src/battery/providers/hidpp.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { selectHidppPaths, LOGITECH_VID, HIDPP_USAGE_PAGE } from "./hidpp";

describe("selectHidppPaths", () => {
	const dev = (over: object) => ({ vendorId: LOGITECH_VID, productId: 0xc52b, usagePage: HIDPP_USAGE_PAGE, usage: 2, path: "p", interface: 2, ...over });
	it("keeps only Logitech HID++ (0xFF00) interfaces", () => {
		const out = selectHidppPaths([
			dev({}),
			dev({ usagePage: 0x0001 }),     // mouse collection — excluded
			dev({ vendorId: 0x1234 }),      // non-Logitech — excluded
		]);
		expect(out).toHaveLength(1);
		expect(out[0].usage).toBe(2);
	});
	it("prefers the long-report collection (usage 2) but keeps usage 1 too", () => {
		const out = selectHidppPaths([dev({ usage: 1, path: "a" }), dev({ usage: 2, path: "b" })]);
		expect(out.map((d) => d.usage).sort()).toEqual([1, 2]);
	});
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/battery/providers/hidpp.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/battery/providers/hidpp.ts`

```ts
import HID from "node-hid";
import type { BatteryProvider, BatteryReading, DeviceInfo } from "../types";
import {
	buildLongRequest, parseResponse, matches, RECEIVER_INDEX, IROOT_INDEX, type ParsedResponse,
} from "../hidpp/reports";
import {
	FEATURE_UNIFIED_BATTERY, FEATURE_BATTERY_STATUS, FEATURE_BATTERY_VOLTAGE,
	parseUnified1004, parseStatus1000, parseVoltage1001, type BatteryParse,
} from "../hidpp/battery";
import {
	buildPairingInfoRequest, buildDeviceNameRequest, parsePairingInfo, parseDeviceName,
} from "../hidpp/enumerate";

export const LOGITECH_VID = 0x046d;
export const HIDPP_USAGE_PAGE = 0xff00;
const REQUEST_TIMEOUT_MS = 800;

type HidDeviceInfo = HID.Device;

/** Pure: keep only Logitech vendor-defined HID++ collections (usage page 0xFF00). */
export function selectHidppPaths(devices: HidDeviceInfo[]): HidDeviceInfo[] {
	return devices.filter((d) => d.vendorId === LOGITECH_VID && d.usagePage === HIDPP_USAGE_PAGE);
}

/** A single HID++ transport: write a request, await the correlated response. */
class HidppTransport {
	private device: HID.HIDAsync;
	private constructor(device: HID.HIDAsync) {
		this.device = device;
	}
	static async open(path: string): Promise<HidppTransport> {
		return new HidppTransport(await HID.HIDAsync.open(path));
	}
	close(): Promise<void> {
		return this.device.close();
	}
	request(req: Buffer): Promise<ParsedResponse> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.device.off("data", onData);
				reject(new Error("hidpp-timeout"));
			}, REQUEST_TIMEOUT_MS);
			const onData = (data: Buffer) => {
				const res = parseResponse(data);
				if (res.kind === "notification" || !matches(req, res)) return;
				clearTimeout(timer);
				this.device.off("data", onData);
				resolve(res);
			};
			this.device.on("data", onData);
			this.device.write(Array.from(req)).catch((e) => {
				clearTimeout(timer);
				this.device.off("data", onData);
				reject(e);
			});
		});
	}
}

async function getFeatureIndex(t: HidppTransport, deviceIndex: number, featureId: number): Promise<number> {
	const res = await t.request(buildLongRequest(deviceIndex, IROOT_INDEX, 0, [(featureId >> 8) & 0xff, featureId & 0xff]));
	if (res.isError) return 0;
	return res.params[0] ?? 0;
}

async function readBattery(t: HidppTransport, deviceIndex: number): Promise<BatteryParse | null> {
	// Preference order 0x1004 -> 0x1000 -> 0x1001.
	const unified = await getFeatureIndex(t, deviceIndex, FEATURE_UNIFIED_BATTERY);
	if (unified) {
		const res = await t.request(buildLongRequest(deviceIndex, unified, 1));
		if (!res.isError) return parseUnified1004(res.params);
	}
	const status = await getFeatureIndex(t, deviceIndex, FEATURE_BATTERY_STATUS);
	if (status) {
		const res = await t.request(buildLongRequest(deviceIndex, status, 0));
		if (!res.isError) return parseStatus1000(res.params);
	}
	const voltage = await getFeatureIndex(t, deviceIndex, FEATURE_BATTERY_VOLTAGE);
	if (voltage) {
		const res = await t.request(buildLongRequest(deviceIndex, voltage, 0));
		if (!res.isError) return parseVoltage1001(res.params);
	}
	return null;
}

export class HidppProvider implements BatteryProvider {
	readonly source = "hidpp" as const;

	private longPath(): string | null {
		const paths = selectHidppPaths(HID.devices()).filter((d) => d.usage === 2 && d.path);
		return paths[0]?.path ?? null;
	}

	async available(): Promise<boolean> {
		return this.longPath() !== null;
	}

	async list(): Promise<DeviceInfo[]> {
		const path = this.longPath();
		if (!path) return [];
		const out: DeviceInfo[] = [];
		const t = await HidppTransport.open(path);
		try {
			for (let n = 1; n <= 6; n++) {
				try {
					const info = await t.request(buildPairingInfoRequest(n));
					if (info.isError) continue;
					const { kindName } = parsePairingInfo(info.params);
					let name = kindName;
					try {
						const nameRes = await t.request(buildDeviceNameRequest(n));
						if (!nameRes.isError) name = parseDeviceName(nameRes.params) || kindName;
					} catch {
						/* keep kindName */
					}
					out.push({ id: `hidpp:${n}`, name, kind: kindName, source: "hidpp" });
				} catch {
					/* device slot empty / asleep */
				}
			}
			// Direct USB/BT device (no receiver) answers at 0xFF.
			if (out.length === 0) out.push({ id: `hidpp:${RECEIVER_INDEX}`, name: "Logitech device", source: "hidpp" });
		} finally {
			await t.close();
		}
		return out;
	}

	async read(deviceId: string): Promise<BatteryReading> {
		const deviceIndex = Number(deviceId.split(":")[1]);
		const path = this.longPath();
		const offline: BatteryReading = { deviceId, name: "Logitech device", percent: 0, state: "off", charging: false };
		if (!path || Number.isNaN(deviceIndex)) return offline;
		const t = await HidppTransport.open(path);
		try {
			const parsed = await readBattery(t, deviceIndex);
			if (!parsed) return { ...offline, state: "asleep" };
			return { deviceId, name: "Logitech device", percent: parsed.percent, state: "active", charging: parsed.charging };
		} catch {
			return { ...offline, state: "asleep" };
		} finally {
			await t.close();
		}
	}
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run src/battery/providers/hidpp.test.ts`
Expected: PASS. (Only `selectHidppPaths` is exercised; the class is import-checked.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/battery/providers/hidpp.ts src/battery/providers/hidpp.test.ts
git commit -m "feat: HID++ provider (node-hid transport, enumeration, battery read)"
```

---

### Task 8: G HUB provider (websocket fallback)

**Files:**
- Create: `src/battery/providers/ghub.ts`, `src/battery/providers/ghub.test.ts`

**Interfaces:**
- Consumes: `BatteryProvider`, `BatteryReading`, `DeviceInfo` (T3).
- Produces:
  - `parseDeviceList(payload: unknown): DeviceInfo[]` (pure)
  - `parseBatteryState(deviceId: string, payload: unknown): Pick<BatteryReading,'percent'|'charging'|'state'>` (pure)
  - `class GHubProvider implements BatteryProvider`
  - `GHUB_WS_URL='ws://localhost:9010'`

Live socket I/O is verified on Windows (T13/manual); unit tests cover the pure payload parsers.

- [ ] **Step 1: Write the failing parser test** `src/battery/providers/ghub.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseDeviceList, parseBatteryState } from "./ghub";

describe("ghub payload parsing", () => {
	it("extracts battery-capable devices", () => {
		const payload = { deviceInfos: [
			{ deviceId: "dev1", displayName: "G Pro Wireless", deviceType: "mouse", capabilities: { hasBatteryStatus: true } },
			{ deviceId: "dev2", displayName: "No Battery KB", deviceType: "keyboard", capabilities: { hasBatteryStatus: false } },
		]};
		const out = parseDeviceList(payload);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ id: "ghub:dev1", name: "G Pro Wireless", source: "ghub" });
	});
	it("reads percent + charging from a battery payload", () => {
		expect(parseBatteryState("ghub:dev1", { percentage: 64, charging: true })).toEqual({ percent: 64, charging: true, state: "active" });
	});
	it("treats a missing percentage as asleep", () => {
		expect(parseBatteryState("ghub:dev1", {}).state).toBe("asleep");
	});
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/battery/providers/ghub.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/battery/providers/ghub.ts`

```ts
import WebSocket from "ws";
import type { BatteryProvider, BatteryReading, DeviceInfo } from "../types";
import type { ConnState } from "../../render/colors";

export const GHUB_WS_URL = "ws://localhost:9010";
const CONNECT_TIMEOUT_MS = 1000;

export function parseDeviceList(payload: unknown): DeviceInfo[] {
	const infos = (payload as { deviceInfos?: unknown[] })?.deviceInfos;
	if (!Array.isArray(infos)) return [];
	const out: DeviceInfo[] = [];
	for (const raw of infos) {
		const d = raw as { deviceId?: string; displayName?: string; deviceType?: string; capabilities?: { hasBatteryStatus?: boolean } };
		if (!d?.deviceId || !d.capabilities?.hasBatteryStatus) continue;
		out.push({ id: `ghub:${d.deviceId}`, name: d.displayName ?? "Logitech device", kind: d.deviceType, source: "ghub" });
	}
	return out;
}

export function parseBatteryState(deviceId: string, payload: unknown): Pick<BatteryReading, "percent" | "charging" | "state"> {
	const p = payload as { percentage?: number; charging?: boolean };
	if (typeof p?.percentage !== "number") return { percent: 0, charging: false, state: "asleep" as ConnState };
	return { percent: Math.round(p.percentage), charging: !!p.charging, state: "active" };
}

interface GHubMsg { msgId?: string; verb: string; path: string; payload?: unknown; result?: string }

/** Open one short-lived connection, send one GET, resolve its payload. */
function ghubGet(path: string): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(GHUB_WS_URL, "json", { origin: "file://" });
		const timer = setTimeout(() => { ws.terminate(); reject(new Error("ghub-timeout")); }, CONNECT_TIMEOUT_MS);
		ws.on("open", () => ws.send(JSON.stringify({ msgId: "", verb: "GET", path } satisfies GHubMsg)));
		ws.on("message", (data) => {
			clearTimeout(timer);
			try {
				const msg = JSON.parse(data.toString()) as GHubMsg;
				resolve(msg.payload);
			} catch (e) {
				reject(e as Error);
			} finally {
				ws.close();
			}
		});
		ws.on("error", (e) => { clearTimeout(timer); reject(e); });
	});
}

export class GHubProvider implements BatteryProvider {
	readonly source = "ghub" as const;

	async available(): Promise<boolean> {
		try {
			await ghubGet("/devices/list");
			return true;
		} catch {
			return false;
		}
	}

	async list(): Promise<DeviceInfo[]> {
		try {
			return parseDeviceList(await ghubGet("/devices/list"));
		} catch {
			return [];
		}
	}

	async read(deviceId: string): Promise<BatteryReading> {
		const rawId = deviceId.replace(/^ghub:/, "");
		try {
			const state = parseBatteryState(deviceId, await ghubGet(`/battery/${rawId}/state`));
			return { deviceId, name: "Logitech device", ...state };
		} catch {
			return { deviceId, name: "Logitech device", percent: 0, state: "off", charging: false };
		}
	}
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run src/battery/providers/ghub.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/battery/providers/ghub.ts src/battery/providers/ghub.test.ts
git commit -m "feat: G HUB websocket provider (fallback) with pure payload parsers"
```

---

### Task 9: Simulator provider (dev only)

**Files:**
- Create: `src/battery/providers/simulator.ts`, `src/battery/providers/simulator.test.ts`

**Interfaces:**
- Consumes: `BatteryProvider`, `BatteryReading`, `DeviceInfo` (T3).
- Produces: `class SimulatorProvider implements BatteryProvider` (available only when `process.env.LBP_SIMULATE === "1"`).

- [ ] **Step 1: Write the failing test** `src/battery/providers/simulator.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { SimulatorProvider } from "./simulator";

describe("SimulatorProvider", () => {
	it("is unavailable unless LBP_SIMULATE=1", async () => {
		const prev = process.env.LBP_SIMULATE;
		delete process.env.LBP_SIMULATE;
		expect(await new SimulatorProvider().available()).toBe(false);
		process.env.LBP_SIMULATE = "1";
		expect(await new SimulatorProvider().available()).toBe(true);
		if (prev === undefined) delete process.env.LBP_SIMULATE; else process.env.LBP_SIMULATE = prev;
	});
	it("lists fake devices and reads a deterministic active reading", async () => {
		const sim = new SimulatorProvider();
		const devices = await sim.list();
		expect(devices.length).toBeGreaterThan(0);
		const r = await sim.read(devices[0].id);
		expect(r.state).toBe("active");
		expect(r.percent).toBeGreaterThanOrEqual(0);
	});
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/battery/providers/simulator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/battery/providers/simulator.ts`

```ts
import type { BatteryProvider, BatteryReading, DeviceInfo } from "../types";

const DEVICES: DeviceInfo[] = [
	{ id: "simulator:mouse", name: "Sim G Pro Wireless", kind: "mouse", source: "simulator" },
	{ id: "simulator:headset", name: "Sim G733", kind: "headset", source: "simulator" },
];
const STATE: Record<string, BatteryReading> = {
	"simulator:mouse": { deviceId: "simulator:mouse", name: "Sim G Pro Wireless", percent: 72, state: "active", charging: false },
	"simulator:headset": { deviceId: "simulator:headset", name: "Sim G733", percent: 35, state: "active", charging: true },
};

export class SimulatorProvider implements BatteryProvider {
	readonly source = "simulator" as const;
	async available(): Promise<boolean> {
		return process.env.LBP_SIMULATE === "1";
	}
	async list(): Promise<DeviceInfo[]> {
		return DEVICES;
	}
	async read(deviceId: string): Promise<BatteryReading> {
		return STATE[deviceId] ?? { deviceId, name: "Sim device", percent: 0, state: "off", charging: false };
	}
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run src/battery/providers/simulator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/battery/providers/simulator.ts src/battery/providers/simulator.test.ts
git commit -m "feat: env-gated simulator provider for dev"
```

---

### Task 10: BatteryService (chain, routing, polling, subscriptions)

**Files:**
- Create: `src/battery/service.ts`, `src/battery/service.test.ts`

**Interfaces:**
- Consumes: `BatteryProvider`, `BatteryReading`, `DeviceInfo` (T3), all three providers (T7–T9).
- Produces:
  - `class BatteryService` with:
    - `constructor(providers: BatteryProvider[])`
    - `listDevices(): Promise<DeviceInfo[]>` (union across available providers, deduped by id)
    - `readDevice(deviceId: string): Promise<BatteryReading>` (routes by `source:` prefix; caches last good reading; degrades to `asleep`/`off` on failure)
    - `subscribe(deviceId: string, pollSeconds: number, cb: (r: BatteryReading) => void): () => void`
  - `export const batteryService: BatteryService` (default chain)

- [ ] **Step 1: Write the failing test** `src/battery/service.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { BatteryService } from "./service";
import type { BatteryProvider, BatteryReading, DeviceInfo } from "./types";

function fakeProvider(source: BatteryProvider["source"], devices: DeviceInfo[], reading?: BatteryReading): BatteryProvider {
	return {
		source,
		available: async () => true,
		list: async () => devices,
		read: async (id) => reading ?? { deviceId: id, name: "x", percent: 0, state: "off", charging: false },
	};
}

describe("BatteryService", () => {
	it("unions and dedupes device lists across providers", async () => {
		const svc = new BatteryService([
			fakeProvider("hidpp", [{ id: "hidpp:1", name: "Mouse", source: "hidpp" }]),
			fakeProvider("ghub", [{ id: "ghub:dev1", name: "Headset", source: "ghub" }]),
		]);
		const list = await svc.listDevices();
		expect(list.map((d) => d.id).sort()).toEqual(["ghub:dev1", "hidpp:1"]);
	});
	it("routes readDevice to the provider matching the id prefix", async () => {
		const reading: BatteryReading = { deviceId: "ghub:dev1", name: "Headset", percent: 64, state: "active", charging: false };
		const svc = new BatteryService([
			fakeProvider("hidpp", []),
			fakeProvider("ghub", [], reading),
		]);
		expect(await svc.readDevice("ghub:dev1")).toEqual(reading);
	});
	it("caches the last good percent and degrades to asleep on failure", async () => {
		let call = 0;
		const flaky: BatteryProvider = {
			source: "hidpp", available: async () => true, list: async () => [],
			read: async (id) => {
				call++;
				if (call === 1) return { deviceId: id, name: "Mouse", percent: 80, state: "active", charging: false };
				throw new Error("offline");
			},
		};
		const svc = new BatteryService([flaky]);
		expect((await svc.readDevice("hidpp:1")).percent).toBe(80);
		const second = await svc.readDevice("hidpp:1");
		expect(second.state).toBe("asleep");
		expect(second.percent).toBe(80); // last-known retained
	});
	it("subscribe polls immediately and on interval, and unsubscribe stops it", async () => {
		vi.useFakeTimers();
		const reading: BatteryReading = { deviceId: "hidpp:1", name: "Mouse", percent: 50, state: "active", charging: false };
		const svc = new BatteryService([fakeProvider("hidpp", [], reading)]);
		const cb = vi.fn();
		const stop = svc.subscribe("hidpp:1", 60, cb);
		await vi.advanceTimersByTimeAsync(0);     // immediate poll
		expect(cb).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000); // one interval
		expect(cb).toHaveBeenCalledTimes(2);
		stop();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(cb).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
	});
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/battery/service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/battery/service.ts`

```ts
import type { BatteryProvider, BatteryReading, DeviceInfo } from "./types";
import { HidppProvider } from "./providers/hidpp";
import { GHubProvider } from "./providers/ghub";
import { SimulatorProvider } from "./providers/simulator";

export class BatteryService {
	private lastGood = new Map<string, BatteryReading>();

	constructor(private providers: BatteryProvider[]) {}

	private providerFor(deviceId: string): BatteryProvider | undefined {
		const source = deviceId.split(":")[0];
		return this.providers.find((p) => p.source === source);
	}

	async listDevices(): Promise<DeviceInfo[]> {
		const byId = new Map<string, DeviceInfo>();
		for (const provider of this.providers) {
			try {
				if (!(await provider.available())) continue;
				for (const d of await provider.list()) if (!byId.has(d.id)) byId.set(d.id, d);
			} catch {
				/* skip a failing provider */
			}
		}
		return [...byId.values()];
	}

	async readDevice(deviceId: string): Promise<BatteryReading> {
		const provider = this.providerFor(deviceId);
		const cached = this.lastGood.get(deviceId);
		if (!provider) return cached ? { ...cached, state: "asleep" } : { deviceId, name: "Logitech device", percent: 0, state: "off", charging: false };
		try {
			const reading = await provider.read(deviceId);
			if (reading.state === "active") {
				this.lastGood.set(deviceId, reading);
				return reading;
			}
			// Not active: prefer last-known percent, mark asleep/off.
			if (cached) return { ...cached, state: reading.state === "off" ? "off" : "asleep" };
			return reading;
		} catch {
			return cached ? { ...cached, state: "asleep" } : { deviceId, name: "Logitech device", percent: 0, state: "asleep", charging: false };
		}
	}

	subscribe(deviceId: string, pollSeconds: number, cb: (r: BatteryReading) => void): () => void {
		let stopped = false;
		const tick = async () => {
			const reading = await this.readDevice(deviceId);
			if (!stopped) cb(reading);
		};
		void tick(); // immediate
		const timer = setInterval(() => void tick(), Math.max(5, pollSeconds) * 1000);
		return () => {
			stopped = true;
			clearInterval(timer);
		};
	}
}

const providers: BatteryProvider[] = [new HidppProvider(), new GHubProvider(), new SimulatorProvider()];
export const batteryService = new BatteryService(providers);
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run src/battery/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/battery/service.ts src/battery/service.test.ts
git commit -m "feat: BatteryService provider chain, routing, caching, polling"
```

---

### Task 11: Wire the action (render on readings, device datasource)

**Files:**
- Modify: `src/actions/battery-status.ts` (replace the T1 stub)
- Create: `src/actions/battery-status.test.ts`

**Interfaces:**
- Consumes: `renderKey` (T2), `readingToRenderInput` (T3), `KeySettings`/`BatteryReading` (T3), `batteryService`/`BatteryService` (T10).
- Produces: the full `BatteryStatus` action; helper `toImageDataUri(svg: string): string`.

- [ ] **Step 1: Write the failing test** `src/actions/battery-status.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { BatteryStatus, toImageDataUri } from "./battery-status";
import { BatteryService } from "../battery/service";
import type { BatteryProvider, BatteryReading } from "../battery/types";

function svcWith(reading: BatteryReading): BatteryService {
	const p: BatteryProvider = {
		source: "hidpp", available: async () => true,
		list: async () => [{ id: reading.deviceId, name: reading.name, source: "hidpp" }],
		read: async () => reading,
	};
	return new BatteryService([p]);
}
function fakeAction() {
	return { id: "ctx1", setImage: vi.fn(async () => {}), setTitle: vi.fn(async () => {}), sendToPropertyInspector: vi.fn(async () => {}) };
}

describe("BatteryStatus", () => {
	it("toImageDataUri wraps svg as an svg+xml data uri", () => {
		expect(toImageDataUri("<svg/>")).toBe("data:image/svg+xml;charset=utf8,%3Csvg%2F%3E");
	});
	it("renders an off image immediately when no device is set", async () => {
		const action = new BatteryStatus(svcWith({ deviceId: "hidpp:1", name: "Mouse", percent: 0, state: "off", charging: false }));
		const a = fakeAction();
		await action.onWillAppear({ action: a, payload: { settings: {} } } as never);
		expect(a.setImage).toHaveBeenCalled();
		expect(a.setImage.mock.calls[0][0]).toContain("data:image/svg+xml");
	});
	it("answers the getDevices datasource request", async () => {
		const action = new BatteryStatus(svcWith({ deviceId: "hidpp:1", name: "Mouse", percent: 50, state: "active", charging: false }));
		const a = fakeAction();
		await action.onSendToPlugin({ action: a, payload: { event: "getDevices" } } as never);
		expect(a.sendToPropertyInspector).toHaveBeenCalledWith(expect.objectContaining({ event: "getDevices", items: [{ label: "Mouse", value: "hidpp:1" }] }));
	});
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/actions/battery-status.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/actions/battery-status.ts`

```ts
import {
	action, SingletonAction,
	type WillAppearEvent, type WillDisappearEvent, type DidReceiveSettingsEvent,
	type KeyDownEvent, type SendToPluginEvent, type JsonObject,
} from "@elgato/streamdeck";
import { renderKey } from "../render/render-key";
import { readingToRenderInput } from "../battery/render-input";
import { batteryService, BatteryService } from "../battery/service";
import type { BatteryReading, KeySettings } from "../battery/types";

export function toImageDataUri(svg: string): string {
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

@action({ UUID: "dev.biczak.logitech-battery.status" })
export class BatteryStatus extends SingletonAction<KeySettings> {
	private unsubscribers = new Map<string, () => void>();

	constructor(private service: BatteryService = batteryService) {
		super();
	}

	private async paint(ctx: { setImage(img: string): Promise<void> }, reading: BatteryReading | null, settings: KeySettings): Promise<void> {
		await ctx.setImage(toImageDataUri(renderKey(readingToRenderInput(reading, settings))));
	}

	private bind(action: { id: string; setImage(img: string): Promise<void> }, settings: KeySettings): void {
		this.unsubscribers.get(action.id)?.();
		this.unsubscribers.delete(action.id);
		if (!settings.deviceId) {
			void this.paint(action, null, settings);
			return;
		}
		const stop = this.service.subscribe(settings.deviceId, settings.pollSeconds ?? 60, (reading) => {
			void this.paint(action, reading, settings);
		});
		this.unsubscribers.set(action.id, stop);
	}

	override onWillAppear(ev: WillAppearEvent<KeySettings>): void {
		this.bind(ev.action, ev.payload.settings);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): void {
		this.bind(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<KeySettings>): void {
		this.unsubscribers.get(ev.action.id)?.();
		this.unsubscribers.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<KeySettings>): Promise<void> {
		const { settings } = ev.payload;
		if (!settings.deviceId) return;
		await this.paint(ev.action, await this.service.readDevice(settings.deviceId), settings);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonObject, KeySettings>): Promise<void> {
		if ((ev.payload as { event?: string })?.event !== "getDevices") return;
		const devices = await this.service.listDevices();
		await ev.action.sendToPropertyInspector({ event: "getDevices", items: devices.map((d) => ({ label: d.name, value: d.id })) });
	}
}
```

- [ ] **Step 4: Update `src/plugin.ts`** (register with the default service — no code change needed if it already does `new BatteryStatus()`; confirm it reads):

```ts
import streamDeck from "@elgato/streamdeck";
import { BatteryStatus } from "./actions/battery-status";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new BatteryStatus());
streamDeck.connect();
```

- [ ] **Step 5: Run tests + typecheck + build**

Run:
```bash
npx vitest run
npm run typecheck
npm run build
```
Expected: all tests PASS; typecheck 0; build writes `bin/plugin.js`.

- [ ] **Step 6: Commit**

```bash
git add src/actions/battery-status.ts src/actions/battery-status.test.ts src/plugin.ts
git commit -m "feat: wire BatteryStatus action to renderer + service + device datasource"
```

---

### Task 12: Full Property Inspector

**Files:**
- Modify: `dev.biczak.logitech-battery.sdPlugin/ui/status.html` (replace the T1 minimal version)

**Interfaces:**
- Consumes: the `getDevices` datasource handled in `onSendToPlugin` (T11); settings keys `deviceId/showNumber/colorMode/chargeAccent/pollSeconds` (T3).

- [ ] **Step 1: Replace the PI** `dev.biczak.logitech-battery.sdPlugin/ui/status.html`

```html
<!DOCTYPE html>
<html>
<head lang="en">
	<title>Battery Status Settings</title>
	<meta charset="utf-8" />
	<script src="sdpi-components.js"></script>
</head>
<body>
	<sdpi-item label="Device">
		<sdpi-select setting="deviceId" datasource="getDevices" placeholder="Select a device" loading="Detecting devices…" hot-reload></sdpi-select>
	</sdpi-item>

	<sdpi-item label="Show percentage">
		<sdpi-checkbox setting="showNumber" default="true"></sdpi-checkbox>
	</sdpi-item>

	<sdpi-item label="Color mode">
		<sdpi-select setting="colorMode" default="smooth">
			<option value="smooth">Smooth (gradient)</option>
			<option value="tiers">Tiers (3 colors)</option>
		</sdpi-select>
	</sdpi-item>

	<sdpi-item label="Charge accent">
		<sdpi-color setting="chargeAccent" default="#ffd54f"></sdpi-color>
	</sdpi-item>

	<sdpi-item label="Poll interval (s)">
		<sdpi-range setting="pollSeconds" min="5" max="600" step="5" default="60" showlabels></sdpi-range>
	</sdpi-item>
</body>
</html>
```

- [ ] **Step 2: Validate**

Run: `npm run validate`
Expected: plugin validates with no errors.

- [ ] **Step 3: Commit**

```bash
git add dev.biczak.logitech-battery.sdPlugin/ui/status.html
git commit -m "feat: full property inspector (device picker + options)"
```

---

### Task 13: Windows probe script

**Files:**
- Create: `scripts/probe.ts`
- Modify: `package.json` (add `probe` script)

**Interfaces:**
- Consumes: `HidppProvider` (T7), `GHubProvider` (T8).

This task's deliverable is verified by the user on Windows (node-hid needs a real device + win32 binary). It is a diagnostic, not unit-tested.

- [ ] **Step 1: Write `scripts/probe.ts`**

```ts
// Diagnostic: enumerate Logitech HID++ interfaces, list devices, read each battery once.
// Run on Windows: `npx tsx scripts/probe.ts` (or compile). Requires node-hid installed for win32.
import HID from "node-hid";
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
```

- [ ] **Step 2: Add the `probe` script** (in `package.json` `scripts`)

```json
        "probe": "tsx scripts/probe.ts"
```

- [ ] **Step 3: Add `tsx` devDependency**

Run: `npm install -D tsx`
Expected: `tsx` added to devDependencies.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 (uses node-hid types; no device needed to typecheck).

- [ ] **Step 5: Commit**

```bash
git add scripts/probe.ts package.json package-lock.json
git commit -m "feat: Windows HID++/G HUB probe diagnostic"
```

---

### Task 14: Packaging + Windows install/run docs

**Files:**
- Create: `README.md`
- Create: `dev.biczak.logitech-battery.sdPlugin/package-lock.json` (generated on Windows; documented)

**Interfaces:** none (documentation + packaging task). Final end-to-end verification is performed by the user on Windows.

- [ ] **Step 1: Write `README.md`**

````markdown
# Logitech Battery — Stream Deck plugin

Shows a Logitech wireless device's battery on a Stream Deck key (level fill, charging
badge, percentage). Reads battery via HID++ directly, falling back to Logitech G HUB.

## Requirements
- Windows 10+ and Stream Deck app 7.1+ (it supplies the Node 24 runtime).
- A Logitech wireless device on a Lightspeed/Unifying/Bolt receiver, or wired/Bluetooth.

## Develop (on WSL/Linux or Windows)
```bash
npm install
npm run icons        # placeholder key/plugin icons
npm test             # unit tests
npm run build        # bundle to bin/plugin.js
npm run validate     # validate the plugin
npm run preview      # build the browser preview harness (open preview/index.html)
```

## Native module (node-hid) on Windows
`node-hid` is native and must be installed for Windows under the plugin folder so its
prebuilt binary ships with the plugin:
```bash
cd dev.biczak.logitech-battery.sdPlugin
npm install          # fetches the win32-x64 node-hid prebuilt into node_modules
cd ..
```
Run this on the **Windows** host (or copy a win32-x64 `node-hid` build into
`dev.biczak.logitech-battery.sdPlugin/node_modules`). If Node 24's NAPI prebuilt is
unavailable, set the manifest `Nodejs.Version` to `"20"` and reinstall.

## Diagnose hardware
```bash
npm run probe        # lists HID++ interfaces + reads each battery once (run on Windows)
```

## Install into Stream Deck (Windows)
```bash
npx streamdeck dev                  # enable developer mode (once)
npx streamdeck link dev.biczak.logitech-battery.sdPlugin
npx streamdeck restart dev.biczak.logitech-battery
```
Add the **Battery Status** action to a key, open its settings, pick your device.

## Develop with the simulator (no hardware)
Set `LBP_SIMULATE=1` in the plugin environment to expose fake devices.
````

- [ ] **Step 2: Verify the full build/test/validate gate one more time**

Run:
```bash
npm test
npm run build
npm run validate
npm run typecheck
```
Expected: tests PASS, build writes `bin/plugin.js`, validate clean, typecheck 0.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with build, native-module, and Windows install steps"
```

- [ ] **Step 4 (USER, on Windows): End-to-end verification**

1. `cd dev.biczak.logitech-battery.sdPlugin && npm install` (gets win32 node-hid), then `cd ..`.
2. `npm run build`.
3. `npm run probe` — confirm your device and battery % print.
4. `npx streamdeck dev`, `npx streamdeck link …`, `npx streamdeck restart …`.
5. Add the action, pick the device in the PI, confirm the key shows the live battery, charging badge when charging, and dims/`—` when the device sleeps/disconnects.

---

## Self-Review

**Spec coverage:**
- Real plugin, Windows, manifest Node 24 → T1. ✓
- SVG key rendering reproducing the prototype (states, smooth/tiers, badge, number) → T2 + visual parity T2b. ✓
- HID++ primary (reports, features 0x1004/0x1000/0x1001, voltage, enumeration, transport) → T4–T7. ✓
- G HUB fallback (ws 9010, device list, battery state) → T8. ✓
- Simulator (env-gated) → T9. ✓
- Provider chain + polling + caching + per-key subscribe + device list → T10. ✓
- Per-key device picker via datasource; settings showNumber/colorMode/chargeAccent/pollSeconds → T11 + T12. ✓
- Verification: unit tests throughout; visual parity T2b; Windows probe T13; end-to-end T14. ✓
- Native-module packaging (external + sdPlugin/package.json + win32 install) → T1 + T14. ✓
- Risks (font, node-hid ABI, G HUB fragility) → documented in spec; font fallback stack in T2, ABI/install in T14.

**Placeholder scan:** No TBD/TODO; every code step has complete code. The voltage table is an explicit, functional approximation with a documented path to the exact kernel table (acceptable — not a placeholder).

**Type consistency:** `ConnState`/`ColorMode` defined once in `colors.ts` and imported everywhere. `BatteryReading`/`DeviceInfo`/`BatteryProvider`/`KeySettings` defined once in `types.ts`. `RenderInput` defined in `render-key.ts`, consumed by `render-input.ts` and the action. Provider `source` literal types (`'hidpp'|'ghub'|'simulator'`) consistent across providers, service routing (id prefix), and `DeviceInfo.source`. `readingToRenderInput`, `renderKey`, `toImageDataUri`, `selectHidppPaths`, `parseResponse`/`matches`, `buildLongRequest`/`buildShortRequest` names consistent between definition and use.

**Open risk carried into execution:** exact HID++ register-0xB5 byte offsets (T6) and the live G HUB payload field names (T8) are from documentation/RE and are confirmed against real hardware in T13/T14; if they differ, adjust the pure parsers (their unit tests pin the agreed layout) and re-run.
