# Swing Issue Fix — Changelog (Final)

**Date**: 2026-02-27  
**Version**: 1.5.5-b  
**Scope**: Faikout swing control (vertical, horizontal, 3D) + system detection fix  
**Files Modified**: `src/index.js`, `config.schema.json`, `sample-config.json`, `package.json`

---

## Problem

On the iOS Home app with an ESP32-Faikout controller:

1. **Fan speed slider activated horizontal swing** — Changing fan speed via the traditional API (`set_control_info?...f_dir=...`) re-sent the entire query string including `f_dir`, which overwrote the swing state.
2. **Oscillation toggle always enabled 3D (both)** — `setSwingMode` for Faikout hard-coded `swingh: true, swingv: true` regardless of the `swingMode` config setting.
3. **No option for vertical-only swing** — The oscillation toggle was binary (off/3D). There was no way to enable vertical swing without also enabling horizontal.
4. **`getSwingMode` reported wrong state** — It showed "enabled" if *either* swingh or swingv was on, not matching what the `swingMode` config intended.
5. **Faikout system type not recognized** — `isFaikin` only matched `system === 'Faikin'`, but config schema offered `'Faikout'` as the option. This meant all Faikout-specific code paths (JSON API, swing switches, WebSocket) were unreachable.

### Root Cause

- The Faikout code path in `setFanSpeed` used the legacy query-string API (`/aircon/set_control_info?...`), which includes `f_dir` in every request — every fan speed change also set the swing direction.
- `setSwingMode` ignored the `swingMode` config value, always sending both swingh+swingv together.
- `isFaikin` only checked for `'Faikin'` string, not `'Faikout'`, so Faikout controllers fell through to the default code path.

---

## Changes Made

### Bug Fix 1: System Detection — Recognize Faikout

**Before**: `this.isFaikin = (this.system === 'Faikin')` — Faikout controllers were not recognized.

**After**: `this.isFaikin = (this.system === 'Faikin' || this.system === 'Faikout')` — both system types now activate the JSON API, WebSocket, and swing switch features. Added `case 'Faikout':` to the switch statement to set up the `/control` endpoint.

### Bug Fix 2: `setFanSpeed` — Use JSON API for Faikout

**Before**: Fan speed changes went through the traditional query-string API, which included `f_dir` and unintentionally changed swing.

**After**: When `this.isFaikin` is true, fan speed now uses the JSON `/control` API endpoint, sending only `{fan: "value"}` — no swing parameters are touched.

### Bug Fix 3: `setSwingMode` — Respect `swingMode` config

**Before**: Always set both `swingh: enableSwing, swingv: enableSwing` (always 3D when enabled).

**After**: Reads `this.swingMode` config to determine which swing axes to control:
- `swingMode: "1"` → only `swingv: true`  (vertical)
- `swingMode: "2"` → only `swingh: true`  (horizontal)
- `swingMode: "3"` → both `swingh: true, swingv: true` (3D)

### Bug Fix 4: `getSwingMode` — Report correct state for Faikout

**Before**: Reported SWING_ENABLED if `swingH || swingV` (either on).

**After**: Reports based on `swingMode` config:
- `"1"` → enabled only if swingV is on
- `"2"` → enabled only if swingH is on
- `"3"` → enabled only if both are on

### New Feature: Independent Vertical/Horizontal Swing Switches

Added two new optional Switch accessories for Faikout controllers:

| Config Option | Switch Name | Controls |
|---|---|---|
| `enableVerticalSwingSwitch` | "Vertical Swing" | `swingv` only |
| `enableHorizontalSwingSwitch` | "Horizontal Swing" | `swingh` only |

Each switch sends only its own parameter to the Faikout `/control` endpoint (e.g. `{swingv: true}`), giving users 3 distinct swing states:

| Vertical Switch | Horizontal Switch | Result |
|---|---|---|
| ON | OFF | Vertical only (up/down) |
| OFF | ON | Horizontal only (left/right) |
| ON | ON | 3D swing (both) |
| OFF | OFF | No swing |

**Helper `_updateMainSwingMode()`**: After toggling either individual switch, the main oscillation characteristic on the HeaterCooler and Fan services is updated to reflect the combined state.

### State Synchronization

- When the main oscillation toggle changes → both individual switches update
- When an individual switch changes → main oscillation toggle updates
- Cached states (`this.Vertical_Swing`, `this.Horizontal_Swing`) stay in sync

### Rename: Faikin → Faikout

All user-facing references (log messages, comments) and internal identifiers (`isFaikout`, `sendFaikoutControl`, `faikoutWs`, etc.) use Faikout. `"system": "Faikin"` remains accepted as a config alias for existing accessories.

---

## Config Schema Changes (`config.schema.json`)

### New Properties Added

```json
"enableVerticalSwingSwitch": {
  "title": "Enable Vertical Swing Switch (Faikout only)",
  "type": "boolean",
  "default": false
},
"verticalSwingName": {
  "title": "Vertical Swing switch name (optional)",
  "type": "string",
  "placeholder": "Vertical Swing"
},
"enableHorizontalSwingSwitch": {
  "title": "Enable Horizontal Swing Switch (Faikout only)",
  "type": "boolean",
  "default": false
},
"horizontalSwingName": {
  "title": "Horizontal Swing switch name (optional)",
  "type": "string",
  "placeholder": "Horizontal Swing"
}
```

### Layout

Placed in the **"Swing & Fan Settings"** section with:
- Help text block explaining the 3 swing modes
- Conditional name fields (only shown when the corresponding switch is enabled)
- Positioned between oscillation settings and fan settings

---

## ESP32-Faikout Protocol Reference

From `Faikout.c` and `S21.md`:

- **S21 G5 command**: Byte 0 — Bit 0 = V-Swing, Bit 1 = H-Swing
- **S21 D5 command**: Sets swing. Byte 0 = `'0' + (swingh?2:0) + (swingv?1:0) + (both?4:0)`
- **`/control` JSON API**: Accepts `{"swingh": true/false, "swingv": true/false}` as independent booleans
- **Legacy API**: `f_dir` values: 0=off, 1=vertical, 2=horizontal, 3=both
- **`daikin_status()`**: Reports `swingh` and `swingv` as separate JSON booleans


