[![npm](https://img.shields.io/npm/dt/homebridge-daikin-local.svg)](https://www.npmjs.com/package/homebridge-daikin-local)
# homebridge-daikin-local

Supports Daikin Air Conditioners on HomeBridge by connecting to the optional WIFI controller like the [Daikin Wifi Controller Split BRP069B42](https://amzn.to/2vqERVX).


# Installation

The following will install HomeBridge-Daikin-local. It retrieves sensor and mode data from Daikin Systems in your local network and allows you to set modes and target temperatures. The install may require you to run as an administrator (using a different login or sudo).
It is recommended to configure your DHCP server to reserve an IP for the wifi controller.
This plugin can be installed using the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x#readme) or manually by following these steps:

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-daikin-local
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
                "accessory": "Daikin-Local",
                "name": "Living room",
                "apiroute": "http://192.168.1.50"
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

This remake is based on homebridge-daikin. Since it's no longer maintained, I forked the project.
