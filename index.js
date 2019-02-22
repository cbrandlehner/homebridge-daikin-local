/*
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

*/


var Service, Characteristic;
var request = require("request");

module.exports = function(homebridge){
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-daikin-local", "Daikin-Local", Daikin);
};

function Daikin(log, config) {
	this.log = log;

	this.name = config.name;
	// this.apiroute = config.apiroute || "apiroute";
	// TODO: Might need some check if config.apiroute actually IS configured and a valid hostname.
        const myURL = new URL(config.apiroute);
	this.apiroute = myURL.origin;
	this.apiIP = myURL.hostname;

	this.log(this.name, this.apiroute, this.apiIP);

	this.model = config.model || "HTTP Model";
	this.firmwareRevision = "HTTP Version";

	//Characteristic.TemperatureDisplayUnits.CELSIUS = 0;
	//Characteristic.TemperatureDisplayUnits.FAHRENHEIT = 1;
	this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
	this.temperature = 19;
	// this.relativeHumidity = 0.70;
	// The value property of CurrentHeatingCoolingState must be one of the following:
	//Characteristic.CurrentHeatingCoolingState.OFF = 0;
	//Characteristic.CurrentHeatingCoolingState.HEAT = 1;
	//Characteristic.CurrentHeatingCoolingState.COOL = 2;
	this.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
	this.targetTemperature = 21;
	// this.targetRelativeHumidity = 0.5;
	// this.heatingThresholdTemperature = 25;
	// this.coolingThresholdTemperature = 18;
	// The value property of TargetHeatingCoolingState must be one of the following:
	//Characteristic.TargetHeatingCoolingState.OFF = 0;
	//Characteristic.TargetHeatingCoolingState.HEAT = 1;
	//Characteristic.TargetHeatingCoolingState.COOL = 2;
	//Characteristic.TargetHeatingCoolingState.AUTO = 3;
	this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;

	this.service = new Service.Thermostat(this.name);
}

function convertDaikinToJSON(input) {
	// Daikin systems respond with HTTP response strings, not JSON objects. JSON is much easier to
	// parse, so we convert it with some RegExp here.
	var stageOne;
	var stageTwo;

	stageOne = replaceAll(input, "\=", "\":\"");
	stageTwo = replaceAll(stageOne, ",", "\",\"");


	return "{\"" + stageTwo + "\"}";
}

function escapeRegExp(str) {
	return str.replace(/([.*+?^=!:${}()|\[\]\/\\]\")/g, "\\$1");
	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_Special_Characters
}

function replaceAll(str, find, replace) {
	return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
	// From http://stackoverflow.com/a/1144788
}

Daikin.prototype = {
	httpRequest: function(url, body, method, username, password, sendimmediately, callback) {
		request({
				url: url,
				body: body,
				method: method,
				auth: {
					user: username,
					pass: password,
					sendImmediately: sendimmediately
				}
			},
			function(error, response, body) {
				callback(error, response, body);
			});
	},
	//Start
	identify: function(callback) {
		this.log("Identify requested!");
		callback(null);
	},
	// Required
	getCurrentHeatingCoolingState: function(callback) {
		this.log("getCurrentHeatingCoolingState from:", this.apiroute+"/aircon/get_control_info");
		request.get({
			url: this.apiroute+"/aircon/get_control_info",
      headers: {
                 'User-Agent' : 'request', 'Host' : this.apiIP
                },
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				var json = JSON.parse(convertDaikinToJSON(body)); //{"pow":"1","mode":3,"stemp":"21","shum":"34.10"}
				this.log("Heating state is %s", json.mode);
				if (json.pow == "0"){
					// The Daikin is off
					this.state = Characteristic.CurrentHeatingCoolingState.OFF;
					this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
				} else if (json.pow == "1") {
					// The Daikin is on
					switch(json.mode) {
						// Commented cases exist for the Daikin, but not for HomeKit.
						// Keeping for reference while I try come up with a way to include them
						/*
						case "2":
						this.state = Characteristic.TargetHeatingCoolingState.DRY;
						break;
						*/
						case "3":
						this.state = Characteristic.CurrentHeatingCoolingState.COOL;
						this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.COOL;
						break;

						case "4":
						this.state = Characteristic.CurrentHeatingCoolingState.HEAT;
						this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.HEAT;
						break;
						/*
						case "6":
						this.state = Characteristic.TargetHeatingCoolingState.FAN;
						break;
						*/
						default:
						this.state = Characteristic.CurrentHeatingCoolingState.AUTO;
						this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;
						this.log("Auto (if 0, 1 or 5), or not handled case:", json.mode);
						break;
					}
				}
				callback(null, this.state); // success
			} else {
				this.log("Error getting state: %s", err);
				callback(err);
			}
		}.bind(this));
	},
	getTargetHeatingCoolingState: function(callback) {
		this.log("getTargetHeatingCoolingState:", this.targetHeatingCoolingState);
		var error = null;
		callback(error, this.targetHeatingCoolingState);
	},
	setTargetHeatingCoolingState: function(value, callback) {
		this.log("setTargetHeatingCoolingState from/to:" + this.targetHeatingCoolingState + "/" + value);
		this.targetHeatingCoolingState = value;
		var cBack = this.setDaikinMode();
		callback(cBack);
	},
	getCurrentTemperature: function(callback) {
		this.log("getCurrentTemperature from:", this.apiroute+"/aircon/get_sensor_info");
		request.get({
			url: this.apiroute+"/aircon/get_sensor_info",
      headers: {
                 'User-Agent' : 'request', 'Host' : this.apiIP
                },
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				var json = JSON.parse(convertDaikinToJSON(body)); //{"ret":"OK","htemp":"24.0","hhum""-","otemp":"-","err":"0","cmpfreq":"0"}
				this.log("Daikin mode is %s, currently %s degrees", this.currentHeatingCoolingState, json.htemp);
				this.temperature = parseFloat(json.htemp);
				callback(null, this.temperature); // success
			} else {
				this.log("Error getting state: %s", err);
				callback(err);
			}
		}.bind(this));
	},
	getTargetTemperature: function(callback) {
		this.log("getTargetTemperature from:", this.apiroute+"/aircon/get_control_info");
		request.get({
			url: this.apiroute+"/aircon/get_control_info",
      headers: {
                 'User-Agent' : 'request', 'Host' : this.apiIP
                },
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				var json = JSON.parse(convertDaikinToJSON(body)); //{"state":"OFF","stateCode":5,"temperature":"18.10","humidity":"34.10"}
				this.targetTemperature = parseFloat(json.stemp);
				this.log("Target temperature is %s", this.targetTemperature);
				callback(null, this.targetTemperature); // success
			} else {
				this.log("Error getting state: %s", err);
				callback(err);
			}
		}.bind(this));
	},
	setTargetTemperature: function(value, callback) {
		this.log("setTargetTemperature to " + value);
		this.targetTemperature = value;
		var cBack = this.setDaikinMode();
		callback(cBack);
	},
	getTemperatureDisplayUnits: function(callback) {
		this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
		var error = null;
		callback(error, this.temperatureDisplayUnits);
	},
	setTemperatureDisplayUnits: function(value, callback) {
		this.log("setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
		this.temperatureDisplayUnits = value;
		var error = null;
		callback(error);
	},

	// Optional
	/*
	getCurrentRelativeHumidity: function(callback) {
		this.log("getCurrentRelativeHumidity from:", this.apiroute+"/aircon/get_control_info");
		request.get({
					url: this.apiroute+"/aircon/get_control_info"
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				var json = JSON.parse(body); //{"state":"OFF","stateCode":5,"temperature":"18.10","humidity":"34.10"}
				this.log("Humidity state is %s (%s)", json.state, json.humidity);
				this.relativeHumidity = parseFloat(json.humidity);
				callback(null, this.relativeHumidity); // success
			} else {
				this.log("Error getting state: %s", err);
				callback(err);
			}
		}.bind(this));
	},
	getTargetRelativeHumidity: function(callback) {
		this.log("getTargetRelativeHumidity:", this.targetRelativeHumidity);
		var error = null;
		callback(error, this.targetRelativeHumidity);
	},
	setTargetRelativeHumidity: function(value, callback) {
		this.log("setTargetRelativeHumidity from/to :", this.targetRelativeHumidity, value);
		this.targetRelativeHumidity = value;
		var error = null;
		callback(error);
	},
	getCoolingThresholdTemperature: function(callback) {
		this.log("getCoolingThresholdTemperature: ", this.coolingThresholdTemperature);
		var error = null;
		callback(error, this.coolingThresholdTemperature);
	},
	getHeatingThresholdTemperature: function(callback) {
		this.log("getHeatingThresholdTemperature :" , this.heatingThresholdTemperature);
		var error = null;
		callback(error, this.heatingThresholdTemperature);
	},*/
	getName: function(callback) {
		this.log("getName :", this.name);
		var error = null;
		callback(error, this.name);
	},

	getServices: function() {

		// you can OPTIONALLY create an information service if you wish to override
		// the default values for things like serial number, model, etc.
		var informationService = new Service.AccessoryInformation();

		this.getModelInfo();

		informationService
			.setCharacteristic(Characteristic.Manufacturer, "Daikin")
			.setCharacteristic(Characteristic.Model, this.model)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision)
			.setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");

		// Required Characteristics
		this.service
			.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', this.getCurrentHeatingCoolingState.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.on('get', this.getTargetHeatingCoolingState.bind(this))
			.on('set', this.setTargetHeatingCoolingState.bind(this));

		this.service
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getCurrentTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', this.getTargetTemperature.bind(this))
			.on('set', this.setTargetTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('get', this.getTemperatureDisplayUnits.bind(this))
			.on('set', this.setTemperatureDisplayUnits.bind(this));

		// Optional Characteristics
		/*
		this.service
			.getCharacteristic(Characteristic.CurrentRelativeHumidity)
			.on('get', this.getCurrentRelativeHumidity.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetRelativeHumidity)
			.on('get', this.getTargetRelativeHumidity.bind(this))
			.on('set', this.setTargetRelativeHumidity.bind(this));

		this.service
			.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.on('get', this.getCoolingThresholdTemperature.bind(this));


		this.service
			.getCharacteristic(Characteristic.HeatingThresholdTemperature)
			.on('get', this.getHeatingThresholdTemperature.bind(this));
		*/
		this.service
			.getCharacteristic(Characteristic.Name)
			.on('get', this.getName.bind(this));

		return [informationService, this.service];
	},

	setDaikinMode: function() {
		// The Daikin doesn't always respond when you only send one parameter, so this is a catchall to send everything at once
		var pow; // 0 or 1
		var mode; // 0, 1, 2, 3, 4, 6 or 7
		var stemp; // Int for degrees in Celcius
		var result;

		// This sets up the Power and Mode parameters
		switch(this.targetHeatingCoolingState) {
			case Characteristic.TargetHeatingCoolingState.OFF:
			pow = "?pow=0";
			mode = "&mode=4";
			break;

			case Characteristic.TargetHeatingCoolingState.HEAT: //"4"
			pow = "?pow=1";
			mode = "&mode=4";
			break;

			case Characteristic.TargetHeatingCoolingState.AUTO: //"0, 1, 5 or 7"
			pow = "?pow=1";
			mode = "&mode=0";
			break;

			case Characteristic.TargetHeatingCoolingState.COOL: //"3"
			pow = "?pow=1";
			mode = "&mode=3";
			break;

			default:
			pow = "?pow=0";
			mode = "&mode=4";
			this.log("Not handled case:", this.targetHeatingCoolingState);
			break;
		}

		// This sets the Target Temperature parameter
		sTemp = "&stemp=" + this.targetTemperature;

		// Finally, we send the command
		this.log("setDaikinMode: setting pow to " + pow + ", mode to " + mode + " and stemp to " + sTemp);
		request.get({
			url: this.apiroute + "/aircon/set_control_info" + pow + mode + sTemp + "&shum=0",
      headers: {
                 'User-Agent' : 'request', 'Host' : this.apiIP
                },
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				result = null; // success
			} else {
				this.log("Error getting state: %s", err);
				result = err;
			}
		}.bind(this));
		return result;
	},

	getModelInfo: function() {
		// A parser for the model details will be coded here, returning the Firmware Revision, and if not set in the config
		// file, the Name and Model as well
    // 'Host' : '192.168.71.135',
		request.get({
			url: this.apiroute+"/aircon/get_model_info",
      headers: {
                 'User-Agent' : 'request', 'Host' : this.apiIP
                },

		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				var json = JSON.parse(convertDaikinToJSON(body)); //{"pow":"1","mode":3,"stemp":"21","shum":"34.10"}
				this.log("Your Model is: " + json.model);

				if (this.model == "HTTP Model" /*& json.model != "NOTSUPPORT"*/) {
					this.model = json.model;
					// this.log("Model: " + json.model + ", " + this.model);
				} // Doesn't yet override original value, working on that later

			} else {
				this.log("Error getting model info: %s", err);
			}
		}.bind(this));

		request.get({
			url: this.apiroute+"/common/basic_info",
      headers: {
                 'User-Agent' : 'request', 'Host' : this.apiIP
                },
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				var json = JSON.parse(convertDaikinToJSON(body)); //{"pow":"1","mode":3,"stemp":"21","shum":"34.10"}

				if (this.name == "Default Daikin") {
					// Need to convert a series of Hexadecimal values to ASCII characters here
				}

				this.firmwareRevision = replaceAll(json.ver, "_", ".");

				this.log("Set firmware version to " + this.firmwareRevision);

			} else {
				this.log("Error getting basic info: %s", err);
			}
		}.bind(this));
	},

	getControlInfo: function() {
		// A parser for the control details from the Daikin will be coded here. It will also record all info returned in
		// the get_control_info calls, so that the plugin behaves a little more like the Daikin app/remote controls,
		// such as remembering each mode's last temperature and reusing it when changing modes
	}
};
