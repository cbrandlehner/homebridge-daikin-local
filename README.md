[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
![node](https://img.shields.io/node/v/homebridge-daikin-local)
[![npm](https://img.shields.io/npm/dt/homebridge-daikin-local.svg)](https://www.npmjs.com/package/homebridge-daikin-local)
[![npm](https://img.shields.io/npm/l/homebridge-daikin-local.svg)](https://github.com/cbrandlehner/homebridge-daikin-local/blob/master/LICENSE)
[![npm version](https://badge.fury.io/js/homebridge-daikin-local.svg)](https://badge.fury.io/js/homebridge-daikin-local)

![Node.js CI](https://github.com/cbrandlehner/homebridge-daikin-local/workflows/Node.js%20CI/badge.svg)
![CodeQL](https://github.com/cbrandlehner/homebridge-daikin-local/workflows/CodeQL/badge.svg)
# homebridge-daikin-local

Supports Daikin Air Conditioners on [HomeBridge](https://github.com/nfarina/homebridge) by connecting to the optional [Daikin Wifi Controller](https://amzn.to/2MZDQjg).


<img src="https://user-images.githubusercontent.com/2294359/80783655-abb6c200-8ba4-11ea-9b60-d5823e3b788f.jpeg" align="center" alt="controller" style="transform:rotate(90deg);" width="50%" height="50%">

<img src="https://user-images.githubusercontent.com/2294359/80783675-b4a79380-8ba4-11ea-9fa8-f48f9bf12585.jpeg" align="center" alt="controller" width="50%" height="50%">

# WARNING

Daikin has removed their local API in newer products. They offer a cloud API accessible only under NDA, which is incompatible with open source. This affects units fitted with the BRP069C4x wifi adapter.

The Daikin App will most likely ask you to update the devices firmware. If you want to continue to use this plugin, DO NOT UPDATE THE FIRMWARE.


# About this plugin

This plugin retrieves sensor and mode data from a [Daikin WIFI controller](https://amzn.to/2MZDQjg) in your local network and allows you to set operation modes and target temperatures. As it is a plugin for [HomeBridge](https://github.com/nfarina/homebridge) you will have access to these features using Apple Home.

It is recommended to configure your DHCP server to reserve a fixed IP for the wifi controller.
This plugin can be installed using [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x#readme).


# Configuration

This screenshot shows the configuration in [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x#readme):

<img src="https://user-images.githubusercontent.com/10800971/80524996-daf4e580-8990-11ea-9e13-3328a65f20af.png" align="center" alt="configuration" width="50%" height="50%">


# Features

The FAN:
The FAN allows you to turn on the fan of your Daikin AC.
You can also set the speed of the fan. Apple HomeKit allows you to set a speed percentage from 0% to 100%.
This plugin translates this percentage value as follows:
0% to 9%: SILENT mode
10% to 20%: AUTO mode
21% to 30%: Level 3
31% to 40%: Level 4
41% to 60%: Level 5
61% to 80%: Level 6
81% to 100%: Level 7 (max)

The AC:
Apple HomeKit settings allow you to enable or disable the swing aka oscillation mode. As HomeKit is limited to a true or false value, the plugin's configuration allows you to configure the type of swing mode. Available modes are "horizontal swing", "vertical swing" and "3D".

<img src="https://user-images.githubusercontent.com/2294359/80783674-b40efd00-8ba4-11ea-9977-5af6bdc5799c.png" align="center" alt="Aircon" width="50%" height="50%">


# Technical background information on the API used

The `apiroute` is used for two main calls: Get info such as current activity and sensor readings from the thermostat and set the target temperature and modes. The Aircon LAN adapter provides two directories for these settings and data:

1. `/common` uses the GET method for control and system information about the Aircon (e.g software version, MAC address, Reboot System, Region)

2. `/aircon` uses the GET method to set Aircon related information (e.g Target Temperature, Modes like Heat and Cool, Temperature Sensor Readings, Timers)

# Supported devices

Currently, this plugin supports Daikin wifi controllers supporting the "aircon" URLs (System: Default) and "skyfi" URLs (System: Skyfi).

To test `http` connectivity, use your browser to connect to your device using one of these URLs:
 ```
http://192.168.1.88/aircon/get_model_info
http://192.168.1.88/skyfi/aircon/get_model_info
 ```
replace the IP (192.168.1.88) with the IP of your device.

Your browser should return a line like this:
 ```
ret=OK,model=0AB9,type=N,pv=2,cpv=2,cpv_minor=00,mid=NA,humd=0,s_humd=0,acled=0,land=0,elec=0,temp=1,temp_rng=0,m_dtct=1,ac_dst=--,disp_dry=0,dmnd=0,en_scdltmr=1,en_frate=1,en_fdir=1,s_fdir=3,en_rtemp_a=0,en_spmode=0,en_ipw_sep=0,en_mompow=0
 ```
If it does not, your device is not yet supported.

To test `https` connectivity see [HTTPS/Registered client support](#https-registered-client)

The response of an unsupported device will look like this:
 ```
ret=PARAM NG,msg=404 Not Found
 ```

Tested devices are documented here: 
(https://github.com/cbrandlehner/homebridge-daikin-local/wiki/Tested-devices,-reported-to-work)

If you have other devices or firmware versions working, please update the wiki.

## HTTPS/Registered client support<a id="https-registered-client"></a>

Some models require requests via `https` containing a registered client token.

It is necessary to register a client token with each device.
The same token may be registered with multiple devices.

These instructions are based on comments in [GitHub Project ael-code/daikin-control Issue #27](https://github.com/ael-code/daikin-control/issues/27)

1. Generate a UUID4 (https://www.uuidgenerator.net can be used), _e.g._ `7b9c9a47-c9c6-4ee1-9063-848e67cc7edd`
2. Strip the `-` from the UUID, _i.e._ `7b9c9a47c9c64ee19063848e67cc7edd`
3. Grab the 13-digit key from the sticker on the back of the controller. _e.g._ `0123456789012`
4. Register the UUID as a client token
```
curl --insecure -H "X-Daikin-uuid: 7b9c9a47c9c64ee19063848e67cc7edd" -v "https://<controller-ip>/common/register_terminal?key=0123456789012"
```

This UUID must be used in client requests to the device.

Test your registered token using the above requests but using `https` instead of `http`, _e.g._
```
curl --insecure -H "X-Daikin-uuid: 7b9c9a47c9c64ee19063848e67cc7edd" -v "https://192.168.1.88/aircon/get_model_info"
curl --insecure -H "X-Daikin-uuid: 7b9c9a47c9c64ee19063848e67cc7edd" -v "https://192.168.1.88/skifi/aircon/get_model_info"
```

In the configuration file, make sure you specify `https` in the `apiroute` option
and add the registered token as the value of `uuid` in the configuration for _each_ device, _e.g._
```
        "accessories": [
            {
                "accessory": "Daikin-Local",
                "name": "Living room",
                "apiroute": "https://192.168.1.50",
                "uuid": "7b9c9a47c9c64ee19063848e67cc7edd",
                "system": "Default",
                "swingMode": "2",
                "defaultMode": "0",
                "fanMode": "FAN",
                "fanName": "Living room FAN"
            }
        ],
```
Make sure to use the correct token if a different token has been registered with each device.

# Debugging and Testing

The code of this plugins generates debug output. Normally, this debug output is not visible on the [homebridge](https://github.com/nfarina/homebridge) console.

Before reporting any issue or bug, enable debugging and restart.
<img src="https://user-images.githubusercontent.com/10800971/213495032-6b8cab33-8a8f-4cb4-ad9e-77ffd8ba89d0.png" align="center" alt="Debug" width="100%" height="100%">
