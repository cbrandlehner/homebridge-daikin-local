# Econo and Powerful Mode Features

## Overview

This plugin has been enhanced to support Daikin's Econo Mode and Powerful Mode features through HomeKit switches. These modes are now available when using the ESP32-Faikin controller.

## Features Added

### 1. Econo Mode (Energy Saving)
- **HomeKit Control**: Appears as a switch in HomeKit named "[AC Name] Econo Mode"
- **Function**: Reduces power consumption by moderating the cooling/heating output
- **API Parameter**: Controls the `en_economode` parameter in the Daikin control API
- **Configuration**: Enable by setting `"enableEconoMode": true` in your config

### 2. Powerful Mode (Maximum Output)
- **HomeKit Control**: Appears as a switch in HomeKit named "[AC Name] Powerful Mode"
- **Function**: Provides maximum cooling or heating output for rapid temperature change
- **API Parameter**: Controls the `en_powerful` parameter in the Daikin control API
- **Configuration**: Enable by setting `"enablePowerfulMode": true` in your config

## Configuration

Add these options to your accessory configuration in `config.json`:

```json
{
    "accessory": "Daikin-Local",
    "name": "Living room",
    "apiroute": "http://192.168.1.50",
    "temperature_unit": "C",
    "enableEconoMode": true,
    "enablePowerfulMode": true,
    ...
}
```

## Using with Homebridge Config UI X

In the Homebridge Config UI X interface, you'll find two new checkboxes:

1. **Econo Mode switch enabled** - Check this to add the Econo mode switch
2. **Powerful Mode switch enabled** - Check this to add the Powerful mode switch

## Important Notes

- **Mutual Exclusivity**: On most Daikin units, Econo mode and Powerful mode are mutually exclusive. Activating one may automatically disable the other.
- **ESP32-Faikin Compatibility**: These features are designed to work with the ESP32-Faikin controller. Ensure your Faikin firmware supports these API parameters.
- **API Parameters**: The implementation uses `en_economode` and `en_powerful` parameters. If your specific AC model uses different parameter names, you may need to adjust the code.

## Troubleshooting

If the switches don't appear in HomeKit:
1. Verify the options are set to `true` in your configuration
2. Restart Homebridge
3. Check the Homebridge logs for any errors related to these features

If the modes don't control your AC:
1. Enable debug mode in Homebridge
2. Check if your Faikin controller returns these parameters in the `/aircon/get_control_info` response
3. Some AC models may use different parameter names - check your Faikin's API documentation

## Testing

You can test the API parameters directly by visiting:
```
http://[your-faikin-ip]/aircon/get_control_info
```

Look for `en_economode` and `en_powerful` in the response. If these parameters are present, the feature should work.

## Code Changes Summary

**Files Modified:**
1. `src/index.js` - Added getter/setter methods and service initialization for both modes
2. `config.schema.json` - Added configuration options for enabling the features
3. `README.md` - Updated feature documentation
4. `sample-config.json` - Added example configuration

**New Methods Added:**
- `getEconoMode()` / `getEconoModeFV()` / `setEconoMode()`
- `getPowerfulMode()` / `getPowerfulModeFV()` / `setPowerfulMode()`

**New Services:**
- `econoModeService` - Switch service for Econo mode
- `powerfulModeService` - Switch service for Powerful mode
