# homebridge-daikin-2019

Supports Daikin Air Conditioners on HomeBridge


# Installation

The following will install HomeBridge-Daikin-2019. It retrieves sensor and mode data from Daikin Systems, and allows you to set modes and target temperatures. The install may require you to run as an administrator (using a different login or sudo)

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-daikin-2019
3. Update your configuration file. See sample-config.json in this repository for a sample.


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
                "accessory": "Daikin Air Conditioner",
                "name": "Living room",
                "url": "http://192.168.1.50"
            }
        ],

        "platforms":[]
    }
```
# API Expectations

The `url` is used for two main calls: Get info such as current activity and sensor readings from the thermostat and set the target temperature and modes. The Aircon LAN adapter provides two directories for these settings and data:

1. `/common` uses the GET method for control and system information about the Aircon (e.g software version, MAC address, Reboot System, Region)

2. `/aircon` uses the GET method to set Aircon related information (e.g Target Temperature, Modes like Heat and Cool, Temperature Sensor Readings, Timers)

# Credit

This 2019 remake is based on homebridge-daikin. Since it's no longer maintained, I forked the project.
