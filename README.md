# homebridge-daikin

Supports Daikin Air Conditioners on HomeBridge

Initially will be built to support talking to a Daikin BRP072A42 Wifi Adapter for a FTXS series Split System Air Conditioner, and once that's working, aim to add support for other Daikin Wifi adapters and Air Conditioners as the information becomes available

# Installation

The following will install HomeBridge-Daikin. In it's current form, it does retrieves sensor and mode data from Daikin Systems, and allows you to set modes and target temperatures. The install may require you to run as an administrator (using a different login or sudo)

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-daikin
3. Update your configuration file. See sample-config.json in this repository for a sample.

IMPORTANT

If you installed a version prior to 0.0.10, please do the following to reinstall plugin to avoid a critical crash:

1. sudo npm uninstall -g homebridge-daikin
2. sudo npm install -g homebridge-daikin

You do not need to change your config.json file if you have the Daikin Accessory entry from previous versions

# Configuration

Configuration sample:

 ```
    {
        "bridge": {
            ...
        },
        
        "description": "...",

        "accessories": [
            {
                "accessory": "Daikin",
                "name": "Daikin Demo",
                "apiroute": "http://myurl.com"
            }
        ],

        "platforms":[]
    }
```
# API Expectations

The `apiroute` is used for two main calls: Get info such as current activity and sensor readings from the thermostat and set the target temperature and modes. The Aircon LAN adapter provides two directories for these settings and data:

1. `/common` uses the GET method for control and system information about the Aircon (e.g software version, MAC address, Reboot System, Region)

2. `/aircon` uses the GET method to set Aircon related information (e.g Target Temperature, Modes like Heat and Cool, Temperature Sensor Readings, Timers)

# Credit

This whole plugin is based on homebridge-thermostat, tuned just for Daikin units specifically. Please check out the original (https://github.com/PJCzx/homebridge-thermostat) and if you have any improvements that are not specific to Daikin systems, contribute there!

Information for the HTTP GET and POST requests is vastly informed from daikin-control (https://github.com/ael-code/daikin-control) with a bit of testing with my own unit to verify commands and find additional settings