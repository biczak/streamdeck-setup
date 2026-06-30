# Logitech Battery — Stream Deck Plugin — Design Spec

**Date:** 2026-06-29
**Status:** Approved design, pending implementation plan
**Source design:** Claude Design project "Logitech Battery Status Plugin" (`Logitech Battery Key.dc.html`)

---

## 1. Goal

A Windows Elgato Stream Deck plugin that displays a Logitech G wireless device's
battery on a key. Each key is bound to one device and continuously renders a
144×144 battery icon — an outline whose fill level shifts red→amber→green, an
optional charging badge, and an optional percentage number — reproducing the
imported `Logitech Battery Key.dc.html` prototype.

The prototype's **left preview** is the key image. The prototype's **right-hand
control panel** (battery slider, connection buttons, charging toggle) maps to the
**Property Inspector** and, during development, to the **simulator** that drives
states without hardware.

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Deliverable | Real Elgato Stream Deck plugin | User selected |
| Target OS | Windows (≥ 10) | User's G HUB environment |
| Battery data source | HID++ direct (primary) → G HUB (fallback) → simulator (dev) | User selected; HID++ needs no extra software, G HUB best-effort |
| Device selection | Per-key device picker (PI dropdown) | User selected; one key per mouse/keyboard/headset |
| Plugin runtime Node | `Nodejs.Version: "24"` (app 7.1+); fall back to `"20"` only if `node-hid` ABI-137 prebuild is unavailable | Modern baseline; closest to host Node 26 |
| Key rendering | SVG string via `setImage("data:image/svg+xml,…")` | `setImage` accepts SVG directly; vector scales to all key sizes; no canvas/raster native dep |
| Poll interval | Default 60 s, user-adjustable per key | Battery changes slowly; frequent HID++ polls can wake a sleeping device |

## 3. Stack (verified current as of 2026-06-29)

- `@elgato/streamdeck` **2.1.0**, scaffolded via `@elgato/cli` **1.7.4**, TypeScript + rollup.
- Manifest **v2 schema**, `SDKVersion: 3`.
- Build toolchain: host Node ≥ 20.5.1 (host has v26.4.0 — fine). Plugin **runtime** Node is the app-bundled one selected by `Nodejs.Version` (`"24"`).
- PI uses Elgato's `sdpi-components` web-component library with the **`datasource`** attribute for the live device dropdown.
- Native dependency: `node-hid` (HID++). `ws` (already an SDK dep) for the G HUB websocket. **No** SQLite dependency — `settings.db` is not used (see §10).

## 4. Architecture & file layout

```
logitech-battery.sdPlugin/        # built output (manifest, bin/, ui/, imgs/)
src/
  plugin.ts                       # registerAction(new BatteryStatus()); streamDeck.connect()
  actions/battery-status.ts       # SingletonAction<Settings>: lifecycle; subscribes a key to a device
  render/render-key.ts            # PURE: (RenderInput) -> SVG string  (the whole visual)
  battery/
    types.ts                      # BatteryProvider, BatteryReading, DeviceInfo, plugin Settings
    service.ts                    # singleton BatteryService: dedupe devices, poll, notify subscribers
    providers/
      hidpp.ts                    # PRIMARY: node-hid + HID++ 2.0
      ghub.ts                     # FALLBACK: ws://localhost:9010 json protocol
      simulator.ts                # DEV: reproduces prototype states
    hidpp/                        # pure, unit-tested protocol layer
      reports.ts                  # short/long report encode + correlation (software-id)
      enumerate.ts                # receiver register 0xB5 device enumeration
      features.ts                 # IRoot 0x0000 getFeature; battery feature read/parse
      voltage-table.ts            # Li-ion mV->percent lookup
  ui/status.html                  # Property Inspector (sdpi-components)
scripts/probe.ts                  # Windows smoke test: enumerate + one read, prints to console
preview/                          # standalone browser harness: imports render-key + simulator
docs/reference/                   # vendored original prototype (.dc.html) — visual source of truth
```

**Unit boundaries:** `render-key.ts` is a pure function (no I/O). The HID++ `hidpp/`
layer is pure byte encode/parse (testable against canned buffers). Providers wrap a
single `read()`/`list()` interface so the service is agnostic to the source.

## 5. Data model

```ts
type ConnState = 'active' | 'asleep' | 'off';

interface BatteryReading {
  deviceId: string;          // stable id (provider:productId:deviceIndex)
  name: string;              // e.g. "G Pro Wireless"
  percent: number;           // 0..100 (last-known when asleep)
  state: ConnState;
  charging: boolean;
}

interface DeviceInfo { id: string; name: string; kind?: string; source: 'hidpp' | 'ghub'; }

interface BatteryProvider {
  list(): Promise<DeviceInfo[]>;              // for the PI dropdown
  read(deviceId: string): Promise<BatteryReading>;
  available(): Promise<boolean>;              // is this source usable right now
}

interface Settings {                          // per-key, persisted by Stream Deck
  deviceId?: string;
  showNumber: boolean;       // default true
  colorMode: 'smooth' | 'tiers';   // default 'smooth'
  chargeAccent: string;      // default '#ffd54f'
  pollSeconds: number;       // default 60
}
```

## 6. Rendering spec (`render-key.ts`) — exact values from the prototype

Output: a 144×144 SVG string. Background `#1a1a1f`, rounded rect `r=18`, subtle
inset 1px stroke `rgba(255,255,255,0.04)`.

- **Battery body:** centered, top offset 38px. Outer rect 96×46, `r=9`, `stroke=strokeColor` width 3, inner padding 4. Fill rect: height = inner height, `r=5`, `width = fillWidth`, `fill = fillColor`, `opacity = fillOpacity`. Nub: 6×18 rounded right, `fill = strokeColor`, 2px right of body.
- **Charging badge** (only when `state==='active' && charging`): 22×22 circle, top 12, horizontally centered, `fill=#16161a`, `stroke=chargeAccent` width 2, drop shadow. Lightning bolt polygon (viewBox `0 0 14 18`, points `8,0 0,10 5,10 4,18 14,7 8,7`) filled `chargeAccent`.
- **Percentage** (only when `showNumber`): centered, baseline near y≈116 (prototype `top:96` + font 30), font-size 30, weight 600, `fill = numberColor`, text = `pctLabel`.

Derived values:

| Var | Rule |
|---|---|
| `accentColor` (fill when active) | `tiers`: ≤20→`#e5484d`, ≤55→`#f5a524`, else `#46a758`. `smooth`: `hsl(h 72% 47%)`, `h = clamp(round(pct*1.2), 0, 120)` |
| `strokeColor` | active `#e9e9ec`, else `#5b5b62` |
| `fillColor` | active `accentColor`, else `#54545b` |
| `fillWidth` | off `0%`, else `pct%` |
| `fillOpacity` | asleep `0.4`, else `1` |
| `numberColor` | active `#f4f4f6`, asleep `#83838b`, off `#5b5b62` |
| `pctLabel` | off `—`, else `pct%` |

**Font open item:** the prototype uses Space Grotesk (Google Fonts). The Stream
Deck SVG renderer will not fetch remote fonts. Plan: embed Space Grotesk (OFL) as a
base64 `@font-face` in the SVG; if the renderer ignores it, fall back to a Windows
system sans (e.g. `Segoe UI`). Verify on Windows. (Alternative considered:
`setTitle` for the number — rejected because per-state color/position control is too
limited.)

## 7. Battery providers

### 7.1 HID++ (primary) — `providers/hidpp.ts` + `hidpp/`
From research (Linux kernel `hid-logitech-hidpp.c` + Solaar, cross-checked):

- **Transport (node-hid):** open `vendorId 0x046D`, `usagePage 0xFF00` collections.
  Two top-level collections: `usage 0x01` (short report `0x10`) and `usage 0x02`
  (long report `0x11`); on Windows these are separate device paths. Use long (usage 2)
  for HID++ 2.0 feature calls; short (usage 1) for receiver register pings. Receiver
  interface: Unifying/Lightspeed/Bolt = iface 2, Nano = iface 1.
- **Report layout:** `[reportId, deviceIndex, featureIndex|subId, funcByte, ...params]`.
  Short = 7 bytes (3 params), long = 20 bytes (16 params). `funcByte = (function<<4) | softwareId`;
  use a fixed nonzero software id (e.g. `0x0A`) to correlate responses and ignore
  spontaneous notifications (sw id 0).
- **Enumeration:** receiver at device index `0xFF`; paired devices `0x01..0x06`. Read
  register `0xB5` (long-register read sub-id `0x83`): sub `0x03`→max devices; sub
  `0x20+n`→WPID + kind nibble; sub `0x40+n`→codename. Or trigger `0x41` connection
  notifications. Direct USB/BT device responds at `0xFF`.
- **Feature discovery:** IRoot `0x0000` at feature index `0x00`, function 0
  `getFeature(featureId)` → returns feature index (0 = unsupported).
- **Battery read** (prefer in order **0x1004 → 0x1000 → 0x1001**):
  - `0x1004 UnifiedBattery`: `getCapabilities` fn0 (flags bit1 = reports true %);
    `getStatus` fn1 → `params[0]`=percent, `params[2]`=charging status
    (0 discharging,1 charging,2 slow,3 full,4 error).
  - `0x1000 BatteryUnifiedLevelStatus`: `getBatteryLevelStatus` fn0 → `params[0]`=%,
    `params[2]`=status. Capacity trustworthy only when discharging/full.
  - `0x1001 BatteryVoltage`: fn0 → `be16` mV + flags (bit7 charging family). mV→%
    via kernel Li-ion table (anchors 4186mV≈100%, 3537mV≈1%) in `voltage-table.ts`.
- **State mapping:** HID++ 1.0 error report `0x10` subId `0x8F` code `0x09`/`0x08`,
  or HID++ 2.0 error feature `0xFF`, or **timeout** → device unreachable → `asleep`
  (keep last-known) or `off` (never seen/paired). Charging from the status byte.

### 7.2 G HUB (fallback) — `providers/ghub.ts`
Reverse-engineered, version-fragile, defensive parsing:
- Connect `ws://localhost:9010`, subprotocol header `json`, `Origin: file://`.
- JSON envelope `{ msgId, verb, path, payload }`. `GET /devices/list` → device array
  (`deviceInfos[]` with id/type/name, `capabilities.hasBatteryStatus`).
  `GET /battery/{deviceId}/state` → percent + charging. Optionally `SUBSCRIBE
  /battery/state/changed` for push updates.
- Any connection refusal / shape mismatch → provider reports unavailable; chain falls through.

### 7.3 Simulator (dev) — `providers/simulator.ts`
Reproduces the prototype's controls: in-memory `{pct, conn, charging}` exposing the
same `BatteryProvider` interface. Used by the preview harness and when neither real
provider is available (dev only; gated so production never silently shows fake data).

## 8. `BatteryService` (singleton)

- Owns the provider chain; `list()` returns the union of provider device lists for the
  PI dropdown (deduped by id).
- Keys subscribe `(deviceId, onReading)` in `onWillAppear`, unsubscribe in
  `onWillDisappear`. The service polls each **unique** device once per the smallest
  `pollSeconds` among its subscribers, caches the last reading (for `asleep`), and
  fans out to all subscribers of that device.
- A provider error for one device is isolated; the service degrades that device to
  `asleep`/`off` rather than throwing.

## 9. Action, Property Inspector, Manifest

- **Action** `battery-status.ts` (`SingletonAction<Settings>`, UUID
  `dev.biczak.logitech-battery.status`): `onWillAppear` subscribe + initial render;
  `onDidReceiveSettings` re-subscribe/re-render on PI edits; `onWillDisappear`
  unsubscribe; `onSendToPlugin` answers the `getDevices` datasource request with
  `{ event:'getDevices', items:[{label,value}] }`. `onKeyDown` forces an immediate poll.
- **Property Inspector** `ui/status.html` (sdpi-components): `<sdpi-select setting="deviceId"
  datasource="getDevices">`, `<sdpi-checkbox setting="showNumber">`, `<sdpi-select
  setting="colorMode">` (smooth/tiers), `<sdpi-color setting="chargeAccent">`,
  `<sdpi-range/textfield setting="pollSeconds">`. Components auto-persist to per-key settings.
- **Manifest** (v2): `UUID dev.biczak.logitech-battery`, `SDKVersion 3`,
  `Nodejs {Version:"24"}`, `Software.MinimumVersion "7.1"`, `OS [{windows, 10}]`,
  `CodePath bin/plugin.js`, one Keypad action with `States[0].Image` default + a
  marketplace/category icon set.

## 10. Scope

**In v1:** Keypad action; HID++ + G HUB + simulator; device picker; smooth/tiers,
showNumber, chargeAccent, pollSeconds; the verification artifacts in §11.

**Out (YAGNI):** dials/encoders; macOS; low-battery notifications/alerts; reading
`settings.db` (research confirms it holds config, not live battery — dropped, also
removing a native SQLite dep); auto device-add hot-plug beyond a periodic re-list.

## 11. Verification strategy (build host is WSL/Linux — cannot run Stream Deck)

- **Unit tests (WSL, `node:test`/vitest):** `render-key` SVG snapshots for each
  state; state-mapping logic; HID++ encode + parse against canned response buffers
  built from the §7.1 byte layouts; voltage→percent table; G HUB message parsing.
- **Visual parity (WSL, browser MCP):** `preview/` harness imports the *real*
  `render-key` + simulator; screenshot and compare to the prototype design.
- **End-to-end (user, on Windows):** `scripts/probe.ts` raw enumerate+read sanity
  check; then `streamdeck link` + `streamdeck restart` to run the real plugin with a
  device. Step-by-step install/test instructions to be included.

## 12. Packaging — native module

`node-hid` is native and runs under the app-bundled Node (ABI 137 for Node 24). Build
host is Linux, so the **win32-x64 prebuilt `.node`** for ABI 137 must be fetched and
bundled into `bin/`. Plan: `prebuild-install`/download the matching prebuild; verify
its presence is the gating check for keeping `Nodejs.Version "24"` vs falling back to
`"20"` (ABI 115). Confirm load on the user's Windows machine via `scripts/probe.ts`.

## 13. Risks / open items

1. **node-hid ABI-137 prebuild** availability for win32-x64 — gates the Node 24 vs 20 choice.
2. **SVG font rendering** in Stream Deck (§6 font open item) — embed vs system-font fallback, verify on Windows.
3. **G HUB websocket** (port/paths/fields) fully reverse-engineered and version-fragile — best-effort only.
4. **HID++ receiver enumeration** is the most intricate code; protocol layer is
   unit-tested, but final confirmation needs a real device on Windows.

## 14. References

- Elgato SDK: https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/ · manifest https://docs.elgato.com/streamdeck/sdk/references/manifest/ · keys/setImage https://docs.elgato.com/streamdeck/sdk/guides/keys/ · UI/PI https://docs.elgato.com/streamdeck/sdk/guides/ui/ · sdpi datasource https://sdpi-components.dev/docs/helpers/data-source
- HID++: Linux kernel `hid-logitech-hidpp.c` https://github.com/torvalds/linux/blob/master/drivers/hid/hid-logitech-hidpp.c · Solaar https://github.com/pwr-Solaar/Solaar · HID++ 2.0 features https://github.com/Logitech/cpg-docs/blob/master/hidpp20/README.rst
- G HUB websocket: https://github.com/andyvorld/LGSTrayBattery_GHUB · settings.db format: https://github.com/gabfv/logitech-g-hub-settings-extractor
