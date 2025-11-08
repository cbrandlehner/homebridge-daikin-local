# Complete Implementation Guide for Fresh Fork
## v1.5.1 - Fan Controls Fix

---

## CRITICAL FIX: Services Array Initialization

**Problem:** The `services` array is declared TOO LATE in the `getServices()` function (around line 2138), but we try to push the linkedFanService to it earlier (around line 2031).

**Solution:** Move the services array declaration to the TOP of getServices(), right after informationService setup.

---

## Step-by-Step Implementation

### 1. Locate getServices() function (around line 1929)

Find this section:
```javascript
getServices: function () {
    const informationService = new Service.AccessoryInformation();

    this.getModelInfo();

    informationService
        .setCharacteristic(Characteristic.Manufacturer, 'Daikin')
        .setCharacteristic(Characteristic.Model, this.model)
        .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision)
        .setCharacteristic(Characteristic.SerialNumber, this.name);
```

### 2. ADD services array initialization IMMEDIATELY after informationService setup

**AFTER line ~1938, ADD these lines:**
```javascript
    // Initialize services array early so it can be used throughout the function
    const services = [informationService, this.heaterCoolerService];
```

### 3. Add Linked Fan Service Logic (around line 1996)

**FIND this section (after HeatingThresholdTemperature setup):**
```javascript
    this.heaterCoolerService
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: this.minTemperature,
        maxValue: this.maxTemperature,
        minStep: Number.parseFloat('0.5'),
      })
      .on('get', this.getHeatingTemperatureFV.bind(this))
      .on('set', this.setHeatingTemperature.bind(this));
```

**IMMEDIATELY AFTER, ADD this complete block:**
```javascript
    // Conditionally add fan controls.
    // If the separate fan accessory is disabled, but fan controls in settings are enabled,
    // we create a linked Fanv2 service to host the controls. This is more reliable
    // with HomeKit caching than adding optional characteristics to HeaterCooler.
    if (this.disableFan && (this.enableFanSpeedInSettings || this.enableOscillationInSettings)) {
        this.log.info('Fan accessory disabled, but settings controls are enabled. Creating a linked Fan service.');

        // Create a new Fanv2 service and link it to the HeaterCooler service
        const linkedFanService = new Service.Fanv2(this.name + ' Fan', 'linked-fan');
        this.heaterCoolerService.addLinkedService(linkedFanService);

        // Set up Active characteristic for the linked fan
        linkedFanService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getActiveFV.bind(this)) // Fan is active when AC is active
            .on('set', this.setActive.bind(this));

        if (this.enableOscillationInSettings) {
            this.log.info('Adding SwingMode to linked Fan service.');
            linkedFanService
                .getCharacteristic(Characteristic.SwingMode)
                .on('get', this.getSwingModeFV.bind(this))
                .on('set', this.setSwingMode.bind(this));
        }

        if (this.enableFanSpeedInSettings) {
            this.log.info('Adding RotationSpeed to linked Fan service.');
            linkedFanService
                .getCharacteristic(Characteristic.RotationSpeed)
                .on('get', this.getFanSpeedFV.bind(this))
                .on('set', this.setFanSpeed.bind(this));
        }
        
        // Add the linked service to the services array
        services.push(linkedFanService);

    } else {
        // Original behavior: If fan controls are enabled, add them to the main HeaterCooler service.
        // This path is taken when `disableFan` is false.
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

### 4. REMOVE the old services array declaration

**FIND this line (around line 2138):**
```javascript
    const services = [informationService, this.heaterCoolerService];
```

**DELETE IT** (because we already declared it at the top)

### 5. Update package.json

```json
{
  "version": "1.5.1",
  "contributors": [
    "@PJCzx Pierre-Julien Cazaux",
    "@greensouth",
    "@fdegier  Fred de Gier",
    "@fabiandev Fabian Leutgeb",
    "@jmfarrow James Farrow",
    "Frank Volkmann",
    "@bogdanovskii",
    "@caalberts Albert Salim",
    "@Badroboot"
  ]
}
```

---

## Summary of Changes

### Files Modified:
1. **src/index.js** - Main implementation file
   - Move services array to top of getServices()
   - Add linked Fanv2 service logic
   - Remove duplicate services array declaration

2. **package.json**
   - Update version to 1.5.1
   - Add @Badroboot to contributors

### Why This Fix Works:
- **Linked Service Approach**: More reliable than optional characteristics due to HomeKit caching
- **Proper Initialization Order**: Services array available when linkedFanService needs to be pushed
- **Backwards Compatible**: Doesn't break existing functionality when disableFan is false

### Testing Configuration:
```json
{
  "accessory": "Daikin-Local",
  "name": "Livingroom AC",
  "disableFan": true,
  "enableFanSpeedInSettings": true,
  "enableOscillationInSettings": true
}
```

### Expected Behavior:
- Fan controls appear in AC accessory settings (not as separate accessory)
- RotationSpeed slider for fan speed control
- SwingMode toggle for oscillation control
- No ReferenceError crashes

---

## Verification Checklist

- [ ] Services array declared at line ~1685 (right after informationService setup)
- [ ] Linked Fanv2 logic added after HeatingThresholdTemperature (~line 1738)
- [ ] Old services array declaration removed from ~line 1895
- [ ] package.json version is 1.5.1
- [ ] No linting errors (run `npm test`)
- [ ] Plugin loads without errors
- [ ] Fan controls visible in HomeKit with test configuration
