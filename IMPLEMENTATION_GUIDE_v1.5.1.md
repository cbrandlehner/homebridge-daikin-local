# Implementation Guide for v1.5.1
## Fan Controls and WebSocket Improvements

---

## Overview

This guide documents the implementation of fan controls and ESP32-Faikout WebSocket improvements in v1.5.1.

### Key Features:
1. **Fan Controls**: Proper visibility logic for fan controls based on configuration
2. **WebSocket Improvements**: Heartbeat mechanism and state synchronization
3. **Config Schema**: Aligned with ESP32-faikout_master implementation
4. **Bug Fixes**: State synchronization and resource cleanup

---

## Fan Controls Implementation

### Configuration Options

**New config options added:**
- `enableFanSpeedInSettings` (default: true) - Show fan speed control in settings
- `enableOscillationInSettings` (default: true) - Show swing mode in settings
- `disableFan` (existing) - Hide separate fan tile from main view

### Fan Visibility Logic

**Case 1: disableFan = true**
- No separate fan tile in main view
- Fan controls (RotationSpeed, SwingMode) added directly as characteristics on HeaterCooler service
- Controls appear in HeaterCooler settings in HomeKit

**Case 2: disableFan = false** 
- Separate fan tile appears in main view
- Optionally also adds controls to HeaterCooler settings if enabled
- Both Fan service and HeaterCooler characteristics available

### Code Location (src/index.js)

**Service Initialization (line ~291):**
```javascript
this.FanService = new Service.Fan(this.fanName);
this.heaterCoolerService = new Service.HeaterCooler(this.name);
this.temperatureService = new Service.TemperatureSensor(this.name);
this.humidityService = new Service.HumiditySensor(this.name);

// Note: Characteristics are added directly to HeaterCooler service
// when disableFan=true (see fan controls logic below)
```

**Services Array Initialization (line ~1779):**
```javascript
// Initialize services array early so it can be used throughout the function
const services = [informationService, this.heaterCoolerService];
```

**Fan Controls Logic (line ~1840):**
```javascript
// Conditionally add fan controls based on configuration:
//
// When disableFan = true:
//   - No separate fan accessory in main view
//   - Fan controls (RotationSpeed, SwingMode) added directly to HeaterCooler settings
//
// When disableFan = false:
//   - Separate fan accessory visible in main view
//   - Optionally also add controls to HeaterCooler settings if enabled

if (this.disableFan) {
    // Fan accessory disabled - add controls directly to HeaterCooler settings
    this.log.info('Fan accessory disabled. Adding fan controls directly to HeaterCooler settings.');

    if (this.enableFanSpeedInSettings) {
        this.log.info('Adding RotationSpeed to HeaterCooler settings.');
        this.heaterCoolerService.getCharacteristic(Characteristic.RotationSpeed)
            .on('get', this.getFanSpeedFV.bind(this))
            .on('set', this.setFanSpeed.bind(this));
    }

    if (this.enableOscillationInSettings) {
        this.log.info('Adding SwingMode to HeaterCooler settings.');
        this.heaterCoolerService.getCharacteristic(Characteristic.SwingMode)
            .on('get', this.getSwingModeFV.bind(this))
            .on('set', this.setSwingMode.bind(this));
    }

} else {
    // Fan accessory enabled - it will appear in main view
    // Add the regular fan service to services array
    this.log.info('Fan accessory enabled. Fan will appear in main view.');
    services.push(this.FanService);

    // Optionally also add controls to HeaterCooler settings
    if (this.enableOscillationInSettings) {
        this.log.info('Adding SwingMode (Oscillation) to HeaterCooler settings.');
        this.heaterCoolerService.getCharacteristic(Characteristic.SwingMode)
            .on('get', this.getSwingModeFV.bind(this))
            .on('set', this.setSwingMode.bind(this));
    }

    if (this.enableFanSpeedInSettings) {
        this.log.info('Adding RotationSpeed (Fan Speed) to HeaterCooler settings.');
        this.heaterCoolerService.getCharacteristic(Characteristic.RotationSpeed)
            .on('get', this.getFanSpeedFV.bind(this))
            .on('set', this.setFanSpeed.bind(this));
    }
}
```

**Services Array Population (line ~1900):**
```javascript
// Only add the regular Fan service if disableFan is false
// When disableFan is true, fan controls are added as characteristics on HeaterCooler
if (this.disableFan === false) {
  // disableFan is false - add regular fan service
  services.push(this.FanService);
  this.log.info('Added regular fan service to services array (disableFan=false)');
}
// Note: When disableFan=true, no fan service is added to the array
// Fan controls are handled via characteristics on the HeaterCooler service
```

---

## WebSocket Improvements

### Heartbeat Mechanism

**Purpose**: Maintain connection and receive status updates from ESP32-Faikout

**Implementation (line ~705):**
```javascript
this.faikoutWsHeartbeat = setInterval(() => {
  if (this.faikoutWs && this.faikoutWs.readyState === 1) {
    this.faikoutWs.send(''); // Send empty heartbeat message
    this.log.debug('connectfaikoutWebSocket: Sent heartbeat to faikout');
  }
}, 1000); // Every 1 second
```

**Cleanup (line ~835, ~890):**
```javascript
if (this.faikoutWsHeartbeat) {
  clearInterval(this.faikoutWsHeartbeat);
  this.faikoutWsHeartbeat = null;
}
```

### State Synchronization

**Problem**: Econo/Powerful/NightQuiet buttons not syncing with faikout UI changes

**Solution**: Use `updateCharacteristic` and track state changes

**Implementation (line ~720):**
```javascript
if (message.econo !== undefined) {
  const econoState = !!message.econo;
  const oldState = this.Econo_Mode;
  
  // Only log when state actually changes
  if (oldState !== econoState) {
    this.log[logMethod]('connectfaikoutWebSocket: Econo mode: %s → %s', oldState, econoState);
  }
  
  this.Econo_Mode = econoState;
  
  if (this.enableEconoMode && this.econoModeService && oldState !== econoState) {
    this.econoModeService.updateCharacteristic(Characteristic.On, this.Econo_Mode);
    this.log[logMethod]('connectfaikoutWebSocket: ✅ Updated Econo switch to: %s', this.Econo_Mode);
  }
}
```

### quietWebSocketLogging Option

**Purpose**: Reduce log verbosity for WebSocket status updates

**Default**: true (quiet by default)

**Implementation (line ~328):**
```javascript
this.quietWebSocketLogging = config.quietWebSocketLogging !== undefined ? config.quietWebSocketLogging : true;
```

**Usage:**
```javascript
const logMethod = this.quietWebSocketLogging ? 'debug' : 'info';
this.log[logMethod]('connectfaikoutWebSocket: <<<< Received status from faikout: %s', JSON.stringify(message));
```

---

## Config Schema Changes

### New Properties

**enableFanSpeedInSettings** (default: true)
```json
{
  "title": "Enable Fan Speed in Settings",
  "type": "boolean",
  "default": true,
  "description": "Show fan speed slider in AC settings"
}
```

**enableOscillationInSettings** (default: true)
```json
{
  "title": "Enable Oscillation in Settings", 
  "type": "boolean",
  "default": true,
  "description": "Show swing mode toggle in AC settings"
}
```

**quietWebSocketLogging** (default: true)
```json
{
  "title": "Quiet WebSocket Logging",
  "type": "boolean",
  "default": true,
  "description": "Use debug level for WebSocket status updates"
}
```

**minTemperature / maxTemperature** (defaults: 18°C / 30°C)
```json
{
  "title": "Minimum Temperature",
  "type": "number",
  "default": 18,
  "minimum": 5,
  "maximum": 20,
  "multipleOf": 0.5
}
```

### Layout Improvements

- Removed temperature offsets from UI (still in properties but hidden)
- Made swingMode visible for all controller types including faikout
- Added help text banners for user guidance
- Reorganized sections for better flow

---

## Testing Configuration

### Test disableFan = true:
```json
{
  "accessory": "Daikin-Local",
  "name": "Livingroom AC",
  "disableFan": true,
  "enableFanSpeedInSettings": true,
  "enableOscillationInSettings": true
}
```

**Expected**: No fan tile in main view, controls in AC settings

### Test disableFan = false:
```json
{
  "accessory": "Daikin-Local",
  "name": "Livingroom AC", 
  "disableFan": false,
  "enableFanSpeedInSettings": true,
  "enableOscillationInSettings": true
}
```

**Expected**: Fan tile in main view AND controls in AC settings

---

### Verification Checklist

- [x] Services array initialized at top of getServices()
- [x] Fan controls logic uses direct characteristics on HeaterCooler when disableFan=true
- [x] disableFan controls fan tile visibility correctly
- [x] RotationSpeed and SwingMode added directly to HeaterCooler when disableFan=true
- [x] WebSocket heartbeat implemented (1s interval)
- [x] State synchronization uses updateCharacteristic
- [x] Heartbeat timer cleanup on disconnect
- [x] quietWebSocketLogging option added
- [x] Config schema aligned with faikout_master
- [x] Temperature ranges configurable (18-30°C defaults)
- [x] No linting errors
- [x] Version updated to 1.5.1

---

## Files Modified

1. **src/index.js** (2040 lines)
   - Line ~291: Service initialization with note about direct characteristics
   - Line ~1840-1880: Fan controls with direct characteristics when disableFan=true
   - Line ~1900: Conditional FanService addition to services array (only when disableFan=false)
   - Line ~328: Added quietWebSocketLogging config
   - Line ~333: Added faikoutWsHeartbeat timer
   - Line ~705: Heartbeat mechanism in WebSocket open handler
   - Line ~720-820: State synchronization with change tracking
   - Line ~835: Heartbeat cleanup on WebSocket close
   - Line ~890: Heartbeat cleanup in closefaikoutWebSocket

2. **config.schema.json** (~344 lines)
   - Added enableFanSpeedInSettings (default: true)
   - Added enableOscillationInSettings (default: true)
   - Added quietWebSocketLogging (default: true)
   - Updated swingMode visibility (no condition)
   - Reorganized layout with help text
   - Adjusted temperature defaults (18-30°C)

3. **IMPLEMENTATION_GUIDE_v1.5.1.md**
   - Updated fan visibility logic to reflect linked services approach
   - Updated code examples and verification checklist

4. **package.json**
   - Version: 1.5.1
   - Added @Badroboot to contributors

5. **.gitignore**
   - Added temp/ folder

---

## Migration from Previous Versions

### From 1.5.0 to 1.5.1:

No breaking changes. New config options have sensible defaults:
- `enableFanSpeedInSettings`: defaults to true
- `enableOscillationInSettings`: defaults to true
- `quietWebSocketLogging`: defaults to true (quiet)
- `minTemperature`: defaults to 18°C (was 10°C)
- `maxTemperature`: defaults to 30°C (was 32°C)

Existing configurations will continue to work without changes.
