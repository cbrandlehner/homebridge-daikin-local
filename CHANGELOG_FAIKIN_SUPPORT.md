# ESP32-Faikout Support - Technical Documentation

## Overview

This document describes the implementation of ESP32-Faikout controller support in homebridge-daikin-local. ESP32-Faikout controllers use the Daikin S21 protocol, which differs significantly from traditional Daikin WiFi modules and requires WebSocket communication for control commands.

**Key Changes**:
- Dual API architecture supporting both Faikout (S21) and traditional Daikin protocols
- WebSocket client for Faikout control commands
- Three special mode switches: Econo, Powerful, Night Quiet
- Enhanced swing mode support with separate horizontal/vertical control
- Always-accessible fan speed control
- 100% backward compatibility with existing Daikin controllers

> **Testing Environment**: Validated with Homebridge on HomeKit only. Other platforms not tested.

---

## Protocol Differences

### Traditional Daikin
```
GET /aircon/set_control_info?pow=1&mode=3&stemp=24&f_rate=A
```
HTTP GET requests with query string parameters.

### Faikout S21
```
WebSocket: ws://[IP]/status
Message: {"power": true, "mode": "C", "temp": 24, "fan": "A"}
```
WebSocket connection with JSON message payloads.

**Why WebSocket**: 
- Faikout does not support REST API `/control` endpoint (returns 405 Method Not Allowed)
- Native Faikout web UI uses WebSocket for all control commands
- Provides bidirectional real-time communication for instant status updates
- Single persistent connection eliminates polling overhead

---

## Implementation Details

### 1. Dual-Path Architecture

All setter/getter methods check `this.isFaikout` flag and route to appropriate handler:

```javascript
if (this.isFaikout) {
    this.sendFaikoutWebSocketCommand({econo: true}, callback);
} else {
    this.sendGetRequest('/aircon/set_control_info?en_economode=1', callback);
}
```

### 2. WebSocket Implementation

**Connection Management**:
```javascript
connectFaikoutWebSocket() {
    this.FaikoutWs = new WebSocket(`ws://${this.apiIP}/status`);
    
    this.FaikoutWs.on('message', (data) => {
        const status = JSON.parse(data);
        this.updateHomeKitCharacteristics(status);
    });
    
    this.FaikoutWs.on('close', () => {
        setTimeout(() => this.connectFaikoutWebSocket(), 5000); // Auto-reconnect
    });
}
```

**Features**:
- Persistent connection with 5-second auto-reconnect
- Command queueing during connection establishment
- Real-time status update processing
- Enhanced logging with directional indicators (`>>>>` / `<<<<`)

### 3. Special Modes

Three separate HomeKit Switch accessories:

| Mode | Faikout Command | Traditional Command | Function |
|------|---------------|---------------------|----------|
| Econo | `{econo: true}` | `en_economode=1` | Energy-saving mode |
| Powerful | `{powerful: true}` | `en_powerful=1` | Maximum performance |
| Night Quiet | `{fan: "Q"}` | `f_rate=B` | Silent operation |

**Mutual Exclusivity**: Enabling one mode automatically disables the other two. Implemented in each setter to prevent conflicting states.

```javascript
setEconoMode: function(value, callback) {
    if (value) {
        if (this.Powerful_Mode) {
            this.Powerful_Mode = false;
            this.powerfulModeService.updateCharacteristic(Characteristic.On, false);
        }
        if (this.NightQuiet_Mode) {
            this.NightQuiet_Mode = false;
            this.nightQuietModeService.updateCharacteristic(Characteristic.On, false);
        }
    }
    
    this.sendFaikoutWebSocketCommand({
        econo: value,
        powerful: false,
        fan: value ? 'A' : undefined
    }, callback);
}
```

### 4. Swing Mode

**Protocol Mapping**:
- **Traditional**: Single `f_dir` parameter (0=off, 1=vertical, 2=horizontal, 3=both)
- **Faikout**: Separate `swingh` and `swingv` boolean flags

**Implementation**: Faikout always uses 3D swing (both flags set to same value).

```javascript
// Faikout
{swingh: true, swingv: true}

// Traditional
f_dir=3  // User-configurable via swingMode setting
```

### 5. Fan Speed Control

Added `RotationSpeed` characteristic to HeaterCooler service for always-accessible fan control:

```
HomeKit → AC Settings → Fan Speed slider
```

Separate Fan accessory still available via `enableFanAccessory` config option.

### 6. ConfiguredName Support

Added `ConfiguredName` characteristic to all switch services:
- Allows manual renaming in HomeKit app
- Names persist across restarts
- Initial names from config options (`econoModeName`, etc.)

### 7. Configuration UI

Reorganized into 5 sections with conditional visibility:
1. Basic Settings
2. Temperature & Mode Settings  
3. Fan Configuration
4. Additional Sensors
5. Special Modes

`swingMode` dropdown hidden when `system = "Faikout"` since swing direction is fixed to 3D

---

## Configuration

### Basic Setup

```json
{
    "accessory": "Daikin-Local",
    "name": "Living Room AC",
    "apiroute": "http://192.168.1.50",
    "system": "Faikout",
    "enableEconoMode": true,
    "enablePowerfulMode": true,
    "enableNightQuietMode": true
}
```

### Full Configuration

```json
{
    "accessory": "Daikin-Local",
    "name": "Bedroom AC",
    "apiroute": "http://192.168.1.100",
    "system": "Faikout",
    "temperature_unit": 0,
    "enableEconoMode": true,
    "econoModeName": "Eco Mode",
    "enablePowerfulMode": true,
    "powerfulModeName": "Turbo Mode",
    "enableNightQuietMode": true,
    "nightQuietModeName": "Silent Mode",
    "enableFanAccessory": false
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `system` | String | "Default" | "Default", "Skyfi", or "Faikout" |
| `enableEconoMode` | Boolean | false | Enable Econo Mode switch |
| `econoModeName` | String | "Econo Mode" | Custom switch name |
| `enablePowerfulMode` | Boolean | false | Enable Powerful Mode switch |
| `powerfulModeName` | String | "Powerful Mode" | Custom switch name |
| `enableNightQuietMode` | Boolean | false | Enable Night Quiet Mode switch |
| `nightQuietModeName` | String | "Night Quiet" | Custom switch name |
| `swingMode` | String | "3" | For traditional controllers only (ignored for Faikout) |

---

## API Reference

### Faikout S21 Attributes

| Attribute | Status | HomeKit Mapping | Notes |
|-----------|--------|----------------|-------|
| `power` | ✅ | Active | Existing implementation |
| `mode` | ✅ | TargetHeaterCoolerState | Existing implementation |
| `temp` | ✅ | CoolingThresholdTemperature / HeatingThresholdTemperature | Existing implementation |
| `fan` | ✅ | RotationSpeed + Night Quiet switch | Enhanced with quiet mode |
| `swingh` | ✅ | SwingMode (combined) | 3D swing only |
| `swingv` | ✅ | SwingMode (combined) | 3D swing only |
| `econo` | ✅ | Econo Mode switch | New implementation |
| `powerful` | ✅ | Powerful Mode switch | New implementation |
| `target` | ❌ | Not implemented | Future enhancement |
| `env` | ❌ | Not implemented | Future enhancement |
| `streamer` | ❌ | Not implemented | Future enhancement |

**Coverage**: 8/11 attributes (73%)

### Command Format Comparison

| Function | Faikout S21 | Traditional Daikin |
|----------|-----------|-------------------|
| Power ON | `{"power": true}` | `pow=1` |
| Cool Mode | `{"mode": "C"}` | `mode=3` |
| Set Temp 24°C | `{"temp": 24}` | `stemp=24` |
| Fan Quiet | `{"fan": "Q"}` | `f_rate=B` |
| 3D Swing | `{"swingh": true, "swingv": true}` | `f_dir=3` |
| Econo Mode | `{"econo": true}` | `en_economode=1` |
| Powerful Mode | `{"powerful": true}` | `en_powerful=1` |

---

## Known Issues

### AC Model Compatibility

Some Daikin AC units reject Econo/Powerful mode commands via S21 protocol.

**Symptom**: Switches turn ON briefly, then OFF after a few seconds.

**Cause**: AC firmware does not support these modes. This occurs in both HomeKit and native Faikout web UI.

**Verification**:
1. Open Faikout web UI (http://[IP])
2. Toggle Econo or Powerful button
3. If button unchecks itself → AC model incompatibility

**Workaround**: Disable non-functional switches in config:
```json
{
    "enableEconoMode": false,
    "enablePowerfulMode": false
}
```

**Note**: Night Quiet mode typically works on all models (standard fan control).

### HomeKit UI

**SwingMode not visible in Apple Home app**:
- HomeKit characteristic supported, but Apple Home app may not display it
- Use third-party apps: Eve, Controller for HomeKit, Home+
- Swing control works via automations

**Switch naming**:
- Initial names: "Switch 1", "Switch 2", "Switch 3"
- Solution: Toggle switches → Check logs → Rename in Home app
- Names persist via `ConfiguredName` characteristic

---

## Migration

### Traditional Daikin → Faikout

1. Install ESP32-Faikout controller: https://github.com/revk/ESP32-Faikout
2. Update config:
   ```json
   {
       "apiroute": "http://[Faikout_IP]",
       "system": "Faikout"
   }
   ```
3. Optional: Enable special modes
4. Restart Homebridge
5. Verify WebSocket connection in logs:
   ```
   [Daikin] Connecting to Faikout WebSocket at ws://192.168.1.50/status
   [Daikin] Faikout WebSocket connected successfully
   ```

### Faikout → Traditional Daikin

Change `"system": "Faikout"` to `"system": "Default"`

Special mode switches will not function (not supported by traditional controllers).

---

## Troubleshooting

### WebSocket Connection Failed

**Checks**:
1. Verify Faikout accessible: `curl http://[IP]/status`
2. Check firewall rules
3. Enable debug logging
4. Review error details in logs

**Note**: Auto-reconnect every 5 seconds. Temporary network issues resolve automatically.

### Switches Turn OFF Immediately

**Diagnosis**:
Check logs for:
```
>>>> Sending to Faikout: {"econo":true}
<<<< Received status from Faikout: {"econo":false}
```

If `econo` returns `false` → AC model incompatibility. Test in Faikout web UI to confirm.

### Basic Controls Not Working

**Checks**:
1. Verify `apiroute` is correct
2. Test WebSocket: `wscat -c ws://[IP]/status`
3. Update Faikout firmware if outdated

---

## Development

### Code Statistics

- **Lines Changed**: ~600
- **New Functions**: 15 (6 getters, 6 setters, 3 WebSocket methods)
- **New Dependencies**: `ws@8.18.0`
- **New Config Options**: 7
- **New HomeKit Accessories**: 3 switches
- **New HomeKit Characteristics**: 2 (RotationSpeed, ConfiguredName)
- **Breaking Changes**: 0

### State Variables

```javascript
this.isFaikout = (this.system === 'Faikout');
this.Econo_Mode = false;
this.Powerful_Mode = false;
this.NightQuiet_Mode = false;
this.FaikoutWs = null;
this.FaikoutWsConnecting = false;
this.FaikoutWsCommandQueue = [];
```

### Helper Methods

**WebSocket**:
- `connectFaikoutWebSocket()`: Establish persistent connection
- `sendFaikoutWebSocketCommand()`: Send commands, queue if connecting
- `closeFaikoutWebSocket()`: Cleanup on shutdown

**Dual-Path**:
- `getEconoMode()` / `setEconoMode()`
- `getPowerfulMode()` / `setPowerfulMode()`
- `getNightQuietMode()` / `setNightQuietMode()`
- `getSwingMode()` / `setSwingMode()`

### Git Commits

1. **2115263**: Fan speed slider on HeaterCooler
2. **9976a00**: Three-way mutual exclusivity
3. **e92a95a**: Fix Night Quiet WebSocket status
4. **41f7cac**: Enhanced WebSocket logging
5. **3cac189**: WebSocket implementation
6. **e51b2a9**: Fix Faikout fallback API parameters
7. **d641391**: Fallback mechanism
8. **30eaf9f**: ESP32-Faikout GitHub link in UI
9. **0a10d58**: SwingMode on Fan service
10. **f1c661f**: ConfiguredName characteristic
11. **45dd261**: UI reorganization
12. **4f4b18a**: Initial Econo/Powerful modes

---

## Future Enhancements

### Potential Additions
- Streamer mode (air purification)
- External temperature sensor support
- Environment settings
- Separate swing switch accessory
- Enhanced fan control (granular speeds)
- Energy monitoring

### Code Improvements
- Consolidate dual-path logic
- Unit tests for Faikout code paths
- JSDoc documentation
- TypeScript migration

---

## Credits

- **ESP32-Faikout**: RevK - https://github.com/revk/ESP32-Faikout
- **Original Plugin**: cbrandlehner/homebridge-daikin-local
- **Implementation**: October 2025

---

*Last Updated: October 28, 2025*



### Basic Configuration Example

```json
{
    "accessory": "Daikin-Local",
    "name": "Living Room AC",
    "apiroute": "http://192.168.1.50",
    "system": "Faikout",
    "temperature_unit": 0,
    "enableEconoMode": true,
    "econoModeName": "Eco Mode",
    "enablePowerfulMode": true,
    "powerfulModeName": "Turbo Mode",
    "enableNightQuietMode": true,
    "nightQuietModeName": "Silent Mode"
}
```

### Using with Homebridge Config UI X

In the configuration interface, you'll find:
1. **Controller Type** dropdown - Select "Faikout" for ESP32-Faikout controllers
2. **Special Modes** section with checkboxes:
   - **Econo Mode switch enabled** - Adds energy-saving mode toggle
   - **Powerful Mode switch enabled** - Adds maximum output mode toggle
   - **Night Quiet switch enabled** - Adds silent operation mode toggle
3. **Custom name fields** appear when modes are enabled - personalize switch names

### Important Notes

- **Mutual Exclusivity**: Econo and Powerful modes cannot be active simultaneously - enabling one automatically disables the other
- **Faikout Swing**: When using Faikout controllers, swing mode automatically uses 3D swing (both horizontal and vertical)
- **Switch Naming**: Switches may initially show as "Switch 1/2/3" in HomeKit - toggle them to identify via logs, then rename in the Home app

---

## Major Features Added

> **Note**: This document consolidates all Faikout-related enhancements including Econo Mode and Powerful Mode features.

### 1. **ESP32-Faikout Controller Support**
- **Date**: October 2025
- **Description**: Added full support for ESP32-Faikout open-source controllers
- **Changes**:
  - Dual API architecture supporting both traditional Daikin and Faikout controllers
  - New configuration option: `"system": "Faikout"` (alongside existing "Default" and "Skyfi")
  - Automatic API selection based on controller type (`this.isFaikout` flag)
  - JSON POST endpoint support for Faikout `/control` API
  - Traditional query string support maintained for legacy controllers

**Technical Implementation**:
```javascript
// Faikout uses JSON POST requests
this.sendFaikoutControl(controlData, callback);
// Traditional uses query string GET requests  
this.sendGetRequest(this.set_control_info + '?' + query, callback);
```

---

### 2. **Econo Mode Support**
- **Feature**: Energy-saving economy mode toggle
- **Implementation**: 
  - **Faikout**: Uses `econo` boolean in JSON payload
  - **Traditional Daikin**: Uses `en_economode` parameter (0/1)
- **HomeKit Integration**: Exposed as a separate Switch accessory
- **Config Options**:
  - `enableEconoMode`: Enable/disable the feature (boolean)
  - `econoModeName`: Custom name for the switch (default: "Econo Mode")
- **Mutual Exclusivity**: Automatically disables Powerful mode when enabled

**API Examples**:
```javascript
// Faikout
POST /control
{"econo": true, "powerful": false}

// Traditional
GET /aircon/set_control_info?...&en_economode=1&en_powerful=0
```

---

### 3. **Powerful Mode Support**
- **Feature**: Maximum performance/turbo mode toggle
- **Implementation**:
  - **Faikout**: Uses `powerful` boolean in JSON payload
  - **Traditional Daikin**: Uses `en_powerful` parameter (0/1)
- **HomeKit Integration**: Exposed as a separate Switch accessory
- **Config Options**:
  - `enablePowerfulMode`: Enable/disable the feature (boolean)
  - `powerfulModeName`: Custom name for the switch (default: "Powerful Mode")
- **Mutual Exclusivity**: Automatically disables Econo mode when enabled

---

### 4. **Night Quiet Mode Support**
- **Feature**: Silent operation mode for nighttime use
- **Implementation**:
  - **Faikout**: Sets fan speed to `"Q"` (quiet mode)
  - **Traditional Daikin**: Sets fan rate to `"B"` (silent mode)
  - When disabled, reverts to `"A"` (auto fan speed)
- **HomeKit Integration**: Exposed as a separate Switch accessory
- **Config Options**:
  - `enableNightQuietMode`: Enable/disable the feature (boolean)
  - `nightQuietModeName`: Custom name for the switch (default: "Night Quiet")

---

### 5. **Enhanced Swing Mode Support**
- **Feature**: Air direction swing control with dual-API support
- **Implementation**:
  - **Faikout**: Uses separate `swingh` and `swingv` booleans for horizontal/vertical swing
    - When enabled, both are set to `true` (3D swing)
    - When disabled, both are set to `false`
  - **Traditional Daikin**: Uses `f_dir` parameter
    - 0 = No swing
    - 1 = Vertical swing
    - 2 = Horizontal swing  
    - 3 = 3D swing (configured via `swingMode` setting)
- **HomeKit Integration**: Registered on HeaterCooler service characteristic

**Code Example**:
```javascript
// Faikout - always 3D swing when enabled
const controlData = {
  swingh: enableSwing,
  swingv: enableSwing
};

// Traditional - user-configurable direction
const query = `f_dir=${this.swingMode}`; // 1, 2, or 3
```

---

### 6. **WebSocket Support for Faikout S21 Protocol**: 
Real-time bidirectional communication with ESP32-Faikout controllers
- **Problem Solved**: Faikout controllers don't support the `/control` JSON POST endpoint; they use WebSocket for control commands
- **Implementation**:
  - Added `ws` npm package (v8.18.0) for WebSocket client
  - Persistent WebSocket connection to `ws://[IP]/status` endpoint
  - Auto-reconnect on disconnection (5-second delay)
  - Command queueing when WebSocket is connecting
  - Real-time status updates from Faikout controller
- **Fallback Strategy**:
  1. Try JSON POST to `/control` endpoint
  2. On "Method Not Allowed" error → Use WebSocket
  3. Send control commands via WebSocket just like the native Faikout web UI
- **Benefits**:
  - ✅ Econo, Powerful, and Night Quiet modes now work correctly
  - ✅ Instant status updates when modes change
  - ✅ Matches native Faikout web UI behavior exactly
  - ✅ Bidirectional communication for better state synchronization

**WebSocket Message Format**:
```javascript
// Sending (matches Faikout web UI):
ws.send(JSON.stringify({econo: true}))
ws.send(JSON.stringify({powerful: true, econo: false}))
ws.send(JSON.stringify({fan: "Q"}))

// Receiving (status updates):
{
  "protocol": "S21",
  "power": true,
  "mode": "C",
  "temp": 24,
  "fan": "A",
  "econo": false,
  "powerful": false,
  "quiet": false
  ...
}
```

**Code Implementation**:
```javascript
connectFaikoutWebSocket() {
  const protocol = this.apiroute.startsWith('https') ? 'wss://' : 'ws://';
  const wsUrl = `${protocol}${this.apiIP}/status`;
  this.FaikoutWs = new WebSocket(wsUrl, { rejectUnauthorized: false });
  
  this.FaikoutWs.on('open', () => {
    // Connection established, send pending commands
  });
  
  this.FaikoutWs.on('message', (data) => {
    // Process status updates, update HomeKit characteristics
  });
  
  this.FaikoutWs.on('close', () => {
    // Auto-reconnect after 5 seconds
  });
}
```

---

### 7. **Three-Way Mutual Exclusivity** ⭐ NEW
- **Feature**: Econo, Powerful, and Night Quiet modes are now fully mutually exclusive
- **Behavior**:
  - **Turn ON Econo** → Disables Powerful + Night Quiet (resets fan to Auto)
  - **Turn ON Powerful** → Disables Econo + Night Quiet (resets fan to Auto)
  - **Turn ON Night Quiet** → Disables Econo + Powerful (sets fan to Quiet)
- **HomeKit Experience**: When you toggle one switch ON, the other two automatically turn OFF
- **Implementation**: Each setter now checks and disables the other two modes before enabling itself

**Code Example**:
```javascript
setEconoMode: function (value, callback) {
  if (value) {
    // Disable other modes
    if (this.Powerful_Mode) {
      this.Powerful_Mode = false;
      this.powerfulModeService.updateValue(false);
    }
    if (this.NightQuiet_Mode) {
      this.NightQuiet_Mode = false;
      this.nightQuietModeService.updateValue(false);
    }
  }
  
  const controlData = {
    econo: value,
    powerful: false,
    fan: value ? 'A' : undefined  // Reset fan from Quiet mode
  };
}
```

---

### 8. **Fan Speed Always Visible** ⭐ NEW
- **Feature**: Fan speed slider now always available in HeaterCooler settings
- **Implementation**: Added `RotationSpeed` characteristic to `heaterCoolerService`
- **User Experience**:
  - **Always available**: Fan speed slider in AC accessory settings (like Oscillate)
  - **Optional**: Separate Fan accessory when `enableFanAccessory` is enabled in config
- **Benefits**:
  - Two ways to control fan speed without requiring separate fan accessory
  - Consistent with how SwingMode (oscillate) is presented
  - More accessible fan control

**Where to Find It**:
```
HomeKit → AC Accessory → Settings (⚙️) → Fan Speed slider
```

---

### 9. **Enhanced Debug Logging**
- **Feature**: Comprehensive logging for WebSocket communication
- **Added Logs**:
  - `>>>> Sending to Faikout:` - Outgoing WebSocket commands
  - `<<<< Received status from Faikout:` - Incoming status updates
  - State change notifications for econo/powerful/quiet modes
  - Connection/reconnection status
  - Raw data on parse errors
- **Benefits**: Easy troubleshooting of Faikout controller communication

---

### 10. **ConfiguredName Characteristic**
- **Feature**: Allow users to manually rename switches in HomeKit
- **Problem Solved**: HomeKit initially shows generic names like "Switch 1", "Switch 2", "Switch 3"
- **Implementation**:
  - Added `ConfiguredName` characteristic to all switch services
  - Initial name set from config (econoModeName, powerfulModeName, nightQuietModeName)
  - Event handlers log when switches are renamed by users
  - Names persist across HomeKit restarts
- **User Experience**: 
  - Users can identify switches by toggling them and checking logs
  - Manual renaming in Home app now works and persists

**Code Added**:
```javascript
this.econoModeService.setCharacteristic(Characteristic.ConfiguredName, this.econoModeName);
this.econoModeService
  .getCharacteristic(Characteristic.ConfiguredName)
  .on('set', (value, callback) => {
    this.log.info('Econo Mode switch renamed to: "%s"', value);
    callback();
  });
```

---

### 11. **Enhanced Configuration UI**
- **Feature**: Organized, user-friendly configuration interface
- **Changes**:
  - Reorganized into **5 logical sections**:
    1. Basic Settings (name, IP, system type)
    2. Temperature & Mode Settings
    3. Fan Configuration
    4. Additional Sensors
    5. Special Modes (Econo, Powerful, Night Quiet with custom names)
  - Added **conditional field visibility**:
    - `swingMode` dropdown hidden when `system = "Faikout"` (auto 3D swing)
    - Custom name fields appear only when corresponding mode is enabled
  - Added **help banner** explaining controller types and Faikout features
  - Improved descriptions for all fields

**Conditional Visibility Example**:
```json
{
  "key": "swingMode",
  "condition": {
    "functionBody": "return model.system !== 'Faikout';"
  }
}
```

---

## Technical Architecture Changes

### API Abstraction Layer
```javascript
// Dual-path implementation throughout all setters/getters
if (this.isFaikout) {
  // JSON POST to /control endpoint
  const controlData = { attribute: value };
  this.sendFaikoutControl(controlData, callback);
} else {
  // Query string GET to /aircon/set_control_info
  const query = body.replace(/,/g, '&').replace(/param=old/, `param=${value}`);
  this.sendGetRequest(this.set_control_info + '?' + query, callback);
}
```

### New Helper Methods
1. **sendFaikoutControl()**: POST JSON payloads to Faikout `/control` endpoint
2. Dual-path implementations for:
   - `getEconoMode()` / `setEconoMode()`
   - `getPowerfulMode()` / `setPowerfulMode()`
   - `getNightQuietMode()` / `setNightQuietMode()`
   - `getSwingMode()` / `setSwingMode()`

### State Management
- Added state variables: `this.Econo_Mode`, `this.Powerful_Mode`, `this.NightQuiet_Mode`
- Mutual exclusivity logic between Econo and Powerful modes
- Early-return caching pattern maintained for all characteristics

---

## Configuration Schema Changes

### New Configuration Options
```json
{
  "system": "Faikout",  // or "Default" or "Skyfi"
  "enableEconoMode": true,
  "econoModeName": "Economy Mode",
  "enablePowerfulMode": true,
  "powerfulModeName": "Turbo Mode",
  "enableNightQuietMode": true,
  "nightQuietModeName": "Silent Mode"
}
```

### Example Complete Configuration
```json
{
  "accessory": "Daikin-Local",
  "name": "Living Room AC",
  "apiroute": "http://192.168.1.100",
  "system": "Faikout",
  "swingMode": "3",
  "enableEconoMode": true,
  "econoModeName": "Eco Mode",
  "enablePowerfulMode": true,
  "powerfulModeName": "Boost Mode",
  "enableNightQuietMode": true,
  "nightQuietModeName": "Night Mode"
}
```

---

## Faikout API Attributes - Implementation Status

| Attribute | Status | Description | Implementation |
|-----------|--------|-------------|----------------|
| `power` | ✅ Implemented | AC on/off | Existing `setActive()` |
| `mode` | ✅ Implemented | Heat/Cool/Auto/Fan/Dry | Existing `setTargetHeaterCoolerState()` |
| `temp` | ✅ Implemented | Target temperature | Existing `setCoolingTemperature()` / `setHeatingTemperature()` |
| `fan` | ✅ Implemented | Fan speed (1-7, A=auto, Q=quiet) | Existing `setFanSpeed()` + Night Quiet |
| `swingh` | ✅ Implemented | Horizontal swing (boolean) | New `setSwingMode()` Faikout path |
| `swingv` | ✅ Implemented | Vertical swing (boolean) | New `setSwingMode()` Faikout path |
| `powerful` | ✅ Implemented | Powerful/turbo mode (boolean) | New `setPowerfulMode()` |
| `econo` | ✅ Implemented | Economy mode (boolean) | New `setEconoMode()` |
| `target` | ❌ Not implemented | Target temperature sensor | Future enhancement |
| `env` | ❌ Not implemented | Environmental settings | Future enhancement |
| `streamer` | ❌ Not implemented | Streamer air purification | Future enhancement |

**8 out of 11 Faikout attributes fully implemented (73% coverage)**

---

## Backward Compatibility

### 100% Maintained
- All existing Daikin "Default" and "Skyfi" functionality unchanged
- No breaking changes to existing configurations
- Conditional logic ensures correct API calls based on `system` setting
- Traditional controllers unaffected by new Faikout code paths

### Migration Path
Users can switch between controller types by simply changing:
```json
"system": "Default"  →  "system": "Faikout"
```
No other configuration changes required.

---

## Git Commits Summary

### Commit History (most recent first)
1. **2115263** - "Add fan speed (RotationSpeed) slider to HeaterCooler service"
2. **9976a00** - "Make Econo, Powerful, and Night Quiet modes mutually exclusive"
3. **e92a95a** - "Fix Night Quiet mode WebSocket status updates"
4. **41f7cac** - "Add enhanced WebSocket logging for debugging Faikout communication"
5. **3cac189** - "Implement WebSocket support for Faikout S21 protocol control"
6. **e51b2a9** - "Fix missing econo/powerful parameters in Faikout fallback API"
7. **d641391** - "Add fallback mechanism for Faikout controllers without JSON /control endpoint"
8. **30eaf9f** - "Add ESP32-Faikout GitHub link to Controller Type section in config UI"
9. **0a10d58** - "Add SwingMode to Fan service for easier access in HomeKit"
10. **f1c661f** - "Add ConfiguredName characteristic to allow manual switch renaming in HomeKit"
11. **45dd261** - "Reorganize config UI into logical sections with conditional visibility"
12. **4f4b18a** - "Implement Econo/Powerful mutual exclusivity and Faikout swing mode support"

---

## Testing & Validation

### Tested Scenarios
✅ Faikout controller with all special modes enabled  
✅ Traditional Daikin controller (no regression)  
✅ Skyfi controller (no regression)  
✅ Mutual exclusivity between Econo and Powerful  
✅ Switch naming and ConfiguredName persistence  
✅ Conditional UI visibility in Homebridge Config UI X  
✅ Swing mode for both controller types  
✅ WebSocket communication with Faikout controllers  
✅ Three-way mutual exclusivity (Econo, Powerful, Night Quiet)  

### Known Limitations

- SwingMode characteristic may not be visible in Apple Home app UI (HomeKit limitation)
  - Workaround: Use third-party HomeKit apps (Eve, Controller, Home+)
  - Alternative: Swing control works programmatically and via automations
- Initial switch names may show as "Switch 1/2/3" until user renames them
  - Solution: Toggle switches to identify via logs, then rename in Home app
- **Econo and Powerful modes may not work on all AC models** ⚠️ NEW
  - Issue: Some Daikin AC units don't properly acknowledge these S21 protocol commands
  - Symptom: Switches turn ON briefly, then automatically turn OFF after a few seconds
  - Cause: AC unit rejects the mode change via S21 protocol (not a plugin bug)
  - Verification: Same behavior occurs in native Faikout web UI
  - Recommendation: If this affects you, report to ESP32-Faikout project with AC model details
  - Workaround: Disable these switches in config if they don't work with your AC model
  - Note: Night Quiet mode (fan speed) typically works on all models

---

## User-Facing Benefits

### For Faikout Users
1. **Full native support** - No need for workarounds or custom configurations
2. **All major features** - Econo, Powerful, Night Quiet, 3D Swing all accessible
3. **Easy setup** - Just set `"system": "Faikout"` in config
4. **Proper JSON API** - Uses native Faikout POST endpoints, not query string hacks

### For Traditional Daikin Users
1. **No changes required** - Existing configurations work identically
2. **New features available** - Can now enable Econo, Powerful, Night Quiet modes
3. **Better organization** - Cleaner config UI with logical sections

### For All Users
1. **Switch renaming** - Can customize switch names in HomeKit
2. **Better UI** - Organized configuration interface with helpful descriptions
3. **Mutual exclusivity** - Econo and Powerful modes properly managed
4. **Logging** - Clear debug and info messages for troubleshooting

---

## Future Enhancement Opportunities

### Potential Additions
1. **Streamer Mode** - Air purification control (Faikout attribute)
2. **Target Temperature Sensor** - External temperature sensor support (Faikout attribute)
3. **Environmental Settings** - Advanced Faikout features (Faikout attribute)
4. **Swing Mode Switch** - Separate switch accessory for easier access (workaround for HomeKit UI limitation)
5. **Enhanced Fan Control** - Faikout supports more granular fan speeds
6. **Status Indicators** - Real-time mode indicators in HomeKit

### Code Quality Improvements
1. Consolidate dual-path implementations into helper methods
2. Add unit tests for Faikout-specific code paths
3. Create integration tests with mock Faikout controller
4. Add JSDoc documentation for all new methods

---

## Documentation Updates Needed

### README.md
- ✅ Faikout attribute support table added
- ✅ Controller type explanations documented
- ⚠️ Consider adding: Full configuration examples section
- ⚠️ Consider adding: Troubleshooting guide for switch naming

### config.schema.json
- ✅ All new fields documented with descriptions
- ✅ Conditional visibility implemented
- ✅ Help banners added

### Code Comments
- ✅ Dual-path logic clearly commented
- ✅ API differences explained in comments
- ⚠️ Consider adding: JSDoc function documentation

---

## Summary Statistics

- **Lines of Code Changed**: ~600 lines
- **New Functions Added**: 15 (6 getters + 6 setters for special modes + 3 WebSocket methods)
- **New Configuration Options**: 7
- **New Dependencies**: 1 (`ws` package for WebSocket)
- **New HomeKit Accessories**: 3 switches (Econo, Powerful, Night Quiet)
- **New HomeKit Characteristics**: 2 (RotationSpeed on HeaterCooler, ConfiguredName on switches)
- **API Compatibility**: 3 protocols supported (Faikout WebSocket + Faikout JSON + Traditional)
- **Faikout Coverage**: 8/11 attributes (73%)
- **Backward Compatibility**: 100% maintained
- **Breaking Changes**: None

---

## Credits & Acknowledgments

- **ESP32-Faikout Project**: RevK's open-source Daikin controller
- **Original Plugin**: cbrandlehner/homebridge-daikin-local
- **Implementation**: October 2025 feature additions
- **Testing**: Faikout controller validation

---

*Last Updated: October 28, 2025*
