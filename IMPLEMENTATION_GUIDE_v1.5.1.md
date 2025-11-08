# Implementation Guide for v1.5.1.dev011
## Fan Controls and WebSocket Improvements

---

## Overview

This guide documents the implementation of fan controls and Faikin WebSocket improvements in v1.5.1.

### Key Features:
1. **Fan Controls**: Proper visibility logic for fan controls based on configuration
2. **WebSocket Improvements**: Heartbeat mechanism and state synchronization
3. **Config Schema**: Aligned with faikin_master implementation
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
- Fan controls appear directly in HeaterCooler settings via linked Fanv2 service
- Uses linked service approach to ensure visibility in HomeKit

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

// Note: Optional characteristics are now handled via linked services
// when disableFan=true to ensure they appear in HeaterCooler settings
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
//   - Fan controls appear directly in HeaterCooler settings via linked service
//
// When disableFan = false:
//   - Separate fan accessory visible in main view
//   - Optionally also add controls to HeaterCooler settings if enabled

if (this.disableFan) {
    // Fan accessory disabled - create linked fan service for HeaterCooler settings
    this.log.info('Fan accessory disabled. Creating linked fan service for HeaterCooler settings.');

        // Create a linked fan service that will appear in HeaterCooler settings
        this.linkedFanService = new Service.Fan(this.fanName + ' Controls', 'linked-fan-service');    // Configure the linked fan service
    this.linkedFanService
        .getCharacteristic(Characteristic.Active)
        .on('get', this.getFanStatusFV.bind(this))
        .on('set', this.setFanStatus.bind(this));

    if (this.enableFanSpeedInSettings) {
        this.log.info('Adding RotationSpeed to linked fan service.');
        this.linkedFanService
            .getCharacteristic(Characteristic.RotationSpeed)
            .on('get', this.getFanSpeedFV.bind(this))
            .on('set', this.setFanSpeed.bind(this));
    }

    if (this.enableOscillationInSettings) {
        this.log.info('Adding SwingMode to linked fan service.');
        this.linkedFanService
            .getCharacteristic(Characteristic.SwingMode)
            .on('get', this.getSwingModeFV.bind(this))
            .on('set', this.setSwingMode.bind(this));
    }

    // Link the fan service to the HeaterCooler service
    this.heaterCoolerService.addLinkedService(this.linkedFanService);

} else {
    // Fan accessory enabled - it will appear in main view
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
// When disableFan is true, we use a linked fan service instead
if (this.disableFan) {
  // disableFan is true - add linked service if it exists
  if (this.linkedFanService) {
    services.push(this.linkedFanService);
    this.log.info('Added linked fan service to services array (disableFan=true)');
  } else {
    this.log.warn('disableFan is true but linkedFanService was not created');
  }
} else {
  // disableFan is false - add regular fan service
  services.push(this.FanService);
  this.log.info('Added regular fan service to services array (disableFan=false)');
}
```

---

## WebSocket Improvements

### Heartbeat Mechanism

**Purpose**: Maintain connection and receive status updates from Faikin

**Implementation (line ~705):**
```javascript
this.faikinWsHeartbeat = setInterval(() => {
  if (this.faikinWs && this.faikinWs.readyState === 1) {
    this.faikinWs.send(''); // Send empty heartbeat message
    this.log.debug('connectFaikinWebSocket: Sent heartbeat to Faikin');
  }
}, 1000); // Every 1 second
```

**Cleanup (line ~835, ~890):**
```javascript
if (this.faikinWsHeartbeat) {
  clearInterval(this.faikinWsHeartbeat);
  this.faikinWsHeartbeat = null;
}
```

### State Synchronization

**Problem**: Econo/Powerful/NightQuiet buttons not syncing with Faikin UI changes

**Solution**: Use `updateCharacteristic` and track state changes

**Implementation (line ~720):**
```javascript
if (message.econo !== undefined) {
  const econoState = !!message.econo;
  const oldState = this.Econo_Mode;
  
  // Only log when state actually changes
  if (oldState !== econoState) {
    this.log[logMethod]('connectFaikinWebSocket: Econo mode: %s → %s', oldState, econoState);
  }
  
  this.Econo_Mode = econoState;
  
  if (this.enableEconoMode && this.econoModeService && oldState !== econoState) {
    this.econoModeService.updateCharacteristic(Characteristic.On, this.Econo_Mode);
    this.log[logMethod]('connectFaikinWebSocket: ✅ Updated Econo switch to: %s', this.Econo_Mode);
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
this.log[logMethod]('connectFaikinWebSocket: <<<< Received status from Faikin: %s', JSON.stringify(message));
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
- Made swingMode visible for all controller types including Faikin
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
- [x] Fan controls logic uses linked Fanv2 service when disableFan=true
- [x] disableFan controls fan tile visibility correctly
- [x] Linked fan service added to HeaterCooler when disableFan=true
- [x] WebSocket heartbeat implemented (1s interval)
- [x] State synchronization uses updateCharacteristic
- [x] Heartbeat timer cleanup on disconnect
- [x] quietWebSocketLogging option added
- [x] Config schema aligned with faikin_master
- [x] Temperature ranges configurable (18-30°C defaults)
- [x] No linting errors
- [x] Version updated to 1.5.1.dev011

---

## Files Modified

1. **src/index.js** (2036 lines)
   - Line ~291: Removed optional characteristics initialization (now uses linked services)
   - Line ~1840-1890: Fan controls with linked Fanv2 service when disableFan=true
   - Line ~1900: Conditional linkedFanService addition to services array
   - Line ~328: Added quietWebSocketLogging config
   - Line ~333: Added faikinWsHeartbeat timer
   - Line ~705: Heartbeat mechanism in WebSocket open handler
   - Line ~720-820: State synchronization with change tracking
   - Line ~835: Heartbeat cleanup on WebSocket close
   - Line ~890: Heartbeat cleanup in closeFaikinWebSocket

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
   - Version: 1.5.1.dev011
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
