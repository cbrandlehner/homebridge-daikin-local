[![node](https://img.shields.io/node/v/gh-badges.svg)](https://img.shields.io/npm/dm/homebridge-daikin-local.svg?style=flat)
[![npm](https://img.shields.io/npm/dt/homebridge-daikin-local.svg)](https://www.npmjs.com/package/homebridge-daikin-local)
[![npm](https://img.shields.io/npm/l/homebridge-daikin-local.svg)](https://www.npmjs.com/package/homebridge-daikin-local)
# homebridge-daikin-local

Supports Daikin Air Conditioners on [HomeBridge](https://github.com/nfarina/homebridge) by connecting to the optional [Daikin Wifi Controller](https://amzn.to/2UM0Gtr).


# Installation

This plugin retrieves sensor and mode data from a [Daikin WIFI controller](https://amzn.to/2UM0Gtr) in your local network and allows you to set operation modes and target temperatures. As it is a plugin for [HomeBridge](https://github.com/nfarina/homebridge) you will have access to this features using Apple Home.

The install may require you to run as an administrator (using a different login or sudo).
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

# Supported devices

Currently this plugin supports Daikin wifi controllers supporting the "aircon" URLs.
To test, use your browser to connect to your device using this URL:
http://192.168.1.88/aircon/get_model_info
replace the IP (192.168.1.88) with the IP of your device.
Your browser should return a line like this:
ret=OK,model=0AB9,type=N,pv=2,cpv=2,cpv_minor=00,mid=NA,humd=0,s_humd=0,acled=0,land=0,elec=0,temp=1,temp_rng=0,m_dtct=1,ac_dst=--,disp_dry=0,dmnd=0,en_scdltmr=1,en_frate=1,en_fdir=1,s_fdir=3,en_rtemp_a=0,en_spmode=0,en_ipw_sep=0,en_mompow=0
If it does not, your device is not yet supported.

Tested devices:
0AB9, Firmware 1.2.51
0ABB, Firmware 3.3.6

If you have other devices working, please let me know so I can update the list of tested devices.

# Credit

This remake is based on homebridge-daikin. Since it's no longer maintained, I forked the project.
