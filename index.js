/*
{
    "bridge": {
    	...
    },

    "description": "...",

    "accessories": [
        {
            "accessory": "Daikin Air Conditioner",
            "name": "Daikin Demo",
            "apiroute": "http://myurl.com"
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
  homebridge.registerAccessory("homebridge-daikin", "Daikin", Daikin);
};


function Daikin(log, config) {
	this.log = log;

	this.name = config.name;
	this.apiroute = config.apiroute || "apiroute";
	this.log(this.name, this.apiroute);

	//Characteristic.TemperatureDisplayUnits.CELSIUS = 0;
	//Characteristic.TemperatureDisplayUnits.FAHRENHEIT = 1;
	this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
	this.temperature = 19;
	// this.relativeHumidity = 0.70;
	// The value property of CurrentHeatingCoolingState must be one of the following:
	//Characteristic.CurrentHeatingCoolingState.OFF = 0;
	//Characteristic.CurrentHeatingCoolingState.HEAT = 1;
	//Characteristic.CurrentHeatingCoolingState.COOL = 2;
	this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
	this.targetTemperature = 21;
	// this.targetRelativeHumidity = 0.5;
	this.heatingThresholdTemperature = 25;
	this.coolingThresholdTemperature = 18;
	// The value property of TargetHeatingCoolingState must be one of the following:
	//Characteristic.TargetHeatingCoolingState.OFF = 0;
	//Characteristic.TargetHeatingCoolingState.HEAT = 1;
	//Characteristic.TargetHeatingCoolingState.COOL = 2;
	//Characteristic.TargetHeatingCoolingState.AUTO = 3;
	this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;
}

function setDaikinMode() {
	// The Daikin doesn't always respond when you only send one parameter, so this is a catchall to send everything at once
	var pow; // 0 or 1
	var mode; // 0, 1, 2, 3, 4, 6 or 7
	var stemp; // Int for degrees in Celcius
	
	// This sets up the Power and Mode parameters
	switch(this.targetHeatingCoolingState) {
		case Characteristic.TargetHeatingCoolingState.OFF:
		pow = "?pow=0";
		break;
		
		case Characteristic.TargetHeatingCoolingState.HEAT: //"4"
		pow = "?pow=1";
		mode = "&mode=4";
		break;
		
		case Characteristic.TargetHeatingCoolingState.AUTO: //"0, 1 or 7"
		pow = "?pow=1";
		mode = "&mode=0";
		break;
		
		case Characteristic.TargetHeatingCoolingState.COOL: //"3"
		pow = "?pow=1";
		mode = "&mode=3";
		break;
		
		default:
		pow = "?pow=0";
		this.log("Not handled case:", this.targetHeatingCoolingState);
		break;
	}
	
	// This sets the Target Temperature parameter
	sTemp = "&stemp=" + this.setTargetTemperature;
	
	// Finally, we send the command
	this.log("setDaikinMode: setting pow to " + pow + ", mode to " + mode + " and stemp to " + sTemp)
	request.get({
		url: this.apiroute + "/common/set_control_info" + pow + mode + sTemp
	}, function(err, response, body) {
		if (!err && response.statusCode == 200) {
			this.log("response success");
			this.heatingCoolingState = this.targetHeatingCoolingState;
			this.targetTemperature = this.setTargetTemperature;
			callback(null); // success
		} else {
			this.log("Error getting state: %s", err);
			callback(err);
		}
}

function convertDaikinToJSON(input) {
	// Daikin systems respond with HTTP response strings, not JSON objects. JSON is much easier to
	// parse, so we convert it with some RegExp here.
	var stageOne;
	var stageTwo;
	
	stageOne = replaceAll(input, "\=", "\":\"");
	stageTwo = replaceAll(stageOne, "&", "\",\"");
	
	
	return "{\"" + stageTwo + "\"}";
}

function escapeRegExp(str) {
	return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
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
			url: this.apiroute+"/aircon/get_control_info"
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				var json = JSON.parse(convertDaikinToJSON(body)); //{"pow":"1","mode":3,"stemp":"21","shum":"34.10"}
				this.log("Heating state is %s", json.mode);
				if (json.pow == "0"){
					// The Daikin is off
					this.state = Characteristic.TargetHeatingCoolingState.OFF;
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
						this.state = Characteristic.TargetHeatingCoolingState.COOL;
						break;
						
						case "4":
						this.state = Characteristic.TargetHeatingCoolingState.HEAT;
						break;
						/*
						case "6":
						this.state = Characteristic.TargetHeatingCoolingState.FAN;
						break;
						*/
						default:
						this.state = Characteristic.TargetHeatingCoolingState.AUTO;
						this.log("Auto (if 0, 1 or 5), or not handled case:", json.mode);
						break;
					}
				)
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
		
		setDaikinMode();
		}.bind(this));
	},
	getCurrentTemperature: function(callback) {
		this.log("getCurrentTemperature from:", this.apiroute+"/aircon/get_sensor_info");
		request.get({
			url: this.apiroute+"/aircon/get_sensor_info"
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				var json = JSON.parse(convertDaikinToJSON(body)); //{"state":"OFF","stateCode":5,"temperature":"18.10","humidity":"34.10"}
				this.log("Heating state is %s (%s)", json.mode, json.htemp);
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
			url: this.apiroute+"/aircon/get_control_info"
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				this.log("response success");
				var json = JSON.parse(convertDaikinToJSON(body)); //{"state":"OFF","stateCode":5,"temperature":"18.10","humidity":"34.10"}
				this.temperature = parseFloat(json.stemp);
				this.log("Target temperature is %s", this.targetTemperature);
				callback(null, this.temperature); // success
			} else {
				this.log("Error getting state: %s", err);
				callback(err);
			}
		}.bind(this));
	},
	setTargetTemperature: function(value, callback) {
		this.log("setTargetTemperature to " + value);
		setDaikinMode();
		}.bind(this));
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
	},*/
	getCoolingThresholdTemperature: function(callback) {
		this.log("getCoolingThresholdTemperature: ", this.coolingThresholdTemperature);
		var error = null;
		callback(error, this.coolingThresholdTemperature);
	},
	getHeatingThresholdTemperature: function(callback) {
		this.log("getHeatingThresholdTemperature :" , this.heatingThresholdTemperature);
		var error = null;
		callback(error, this.heatingThresholdTemperature);
	},
	getName: function(callback) {
		this.log("getName :", this.name);
		var error = null;
		callback(error, this.name);
	},

	getServices: function() {

		// you can OPTIONALLY create an information service if you wish to override
		// the default values for things like serial number, model, etc.
		var informationService = new Service.AccessoryInformation();

		informationService
			.setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
			.setCharacteristic(Characteristic.Model, "HTTP Model")
			.setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");

		var daikinService = new Service.Thermostat(this.name);

		// Required Characteristics
		daikinService
			.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', this.getCurrentHeatingCoolingState.bind(this));

		daikinService
			.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.on('get', this.getTargetHeatingCoolingState.bind(this))
			.on('set', this.setTargetHeatingCoolingState.bind(this));

		daikinService
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getCurrentTemperature.bind(this));

		daikinService
			.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', this.getTargetTemperature.bind(this))
			.on('set', this.setTargetTemperature.bind(this));

		daikinService
			.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('get', this.getTemperatureDisplayUnits.bind(this))
			.on('set', this.setTemperatureDisplayUnits.bind(this));

		// Optional Characteristics
		/*
		daikinService
			.getCharacteristic(Characteristic.CurrentRelativeHumidity)
			.on('get', this.getCurrentRelativeHumidity.bind(this));

		daikinService
			.getCharacteristic(Characteristic.TargetRelativeHumidity)
			.on('get', this.getTargetRelativeHumidity.bind(this))
			.on('set', this.setTargetRelativeHumidity.bind(this));
		*/
		daikinService
			.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.on('get', this.getCoolingThresholdTemperature.bind(this));
		

		daikinService
			.getCharacteristic(Characteristic.HeatingThresholdTemperature)
			.on('get', this.getHeatingThresholdTemperature.bind(this));

		daikinService
			.getCharacteristic(Characteristic.Name)
			.on('get', this.getName.bind(this));

		return [informationService, daikinService];
	}
};
