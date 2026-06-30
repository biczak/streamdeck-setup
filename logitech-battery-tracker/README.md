# Logitech Battery — Stream Deck plugin

Shows a Logitech wireless device's battery on a Stream Deck key — a level fill that shifts
red→amber→green (smooth or 3-tier), an optional percentage, and a charging state shown by
tinting the battery outline in a custom accent color. Reads battery over HID++ directly
(event-driven, so charging/level changes show within a second or two), falling back to
Logitech G HUB.

## How updates work
- **HID++ (primary):** the plugin holds the device handle open and reacts to the device's
  spontaneous battery events, so charging/level changes appear near-instantly with almost
  no polling. An infrequent safety read (~5 min) backstops any missed event.
- **G HUB (fallback):** polled on the interval set in the action's inspector (default 60s).
  The poll-interval control affects only this path — HID++ does not poll.

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

> **Tip:** Bind at most one key per device — each key opens its own connection to the device.

## Develop with the simulator (no hardware)
Set `LBP_SIMULATE=1` in the plugin environment to expose fake devices.
