/*
{
    "bridge": {
    	...
    },
    
    "description": "...",

    "accessories": [
        {
            "accessory": "Thermostat",
            "name": "Thermostat Demo",
            "aSetting": "Hello"
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
  homebridge.registerAccessory("homebridge-thermostat", "Thermostat", Thermostat);
}


function Thermostat(log, config) {
	this.log = log;

	this.aSetting = config["aSetting"] || "aSetting";
	this.name = config["name"];
	this.log(this);
}

Thermostat.prototype = {

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
				callback(error, response, body)
			})
	},
	//Start
	identify: function(callback) {
		this.log("Identify requested!");
		callback(null);
	},
	// Required
	getCurrentHeatingCoolingState: function(callback) {
		this.log("getCurrentHeatingCoolingState");
		callback(10);
	},
	setTargetHeatingCoolingState: function(value, callback) {
		this.log("setTargetHeatingCoolingState");
		callback(null, value);
	},
	getCurrentTemperature: function(callback) {
		this.log("getCurrentTemperature");
		callback(11);
	},
	setTargetTemperature: function(value, callback) {
		this.log("setTargetTemperature");
		callback(null, value);
	},
	getTemperatureDisplayUnits: function(callback) {
		this.log("getTemperatureDisplayUnits");
		callback(null, Characteristic.TemperatureDisplayUnits.CELSIUS);
	},

	// Optional
	getCurrentRelativeHumidity: function(callback) {
		this.log("getCurrentRelativeHumidity");
		callback(12);
	},
	setTargetRelativeHumidity: function(value, callback) {
		this.log("setTargetRelativeHumidity");
		callback(null, value);
	},
	getCoolingThresholdTemperature: function(callback) {
		this.log("getCoolingThresholdTemperature");
		callback(null, 13);
	},
	getHeatingThresholdTemperature: function(callback) {
		this.log("getHeatingThresholdTemperature");
		callback(null, 14);
	},
	getName: function(callback) {
		this.log("getName");
		callback(null, this.name);
	},

	getServices: function() {

		// you can OPTIONALLY create an information service if you wish to override
		// the default values for things like serial number, model, etc.
		var informationService = new Service.AccessoryInformation();

		informationService
			.setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
			.setCharacteristic(Characteristic.Model, "HTTP Model")
			.setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");

			var thermostatService = new Service.Thermostat(this.name);

			// Required Characteristics
			thermostatService
				.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
				.on('get', this.getCurrentHeatingCoolingState.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.TargetHeatingCoolingState)
				.on('set', this.setTargetHeatingCoolingState.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.CurrentTemperature)
				.on('get', this.getCurrentTemperature.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.TargetTemperature)
				.on('set', this.setTargetTemperature.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.TemperatureDisplayUnits)
				.on('get', this.getTemperatureDisplayUnits.bind(this));

			// Optional Characteristics
			thermostatService
				.getCharacteristic(Characteristic.CurrentRelativeHumidity)
				.on('get', this.getCurrentRelativeHumidity.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.CurrentRelativeHumidity)
				.on('set', this.setTargetRelativeHumidity.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.CoolingThresholdTemperature)
				.on('get', this.getCoolingThresholdTemperature.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.CoolingThresholdTemperature)
				.on('get', this.getHeatingThresholdTemperature.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.Name)
				.on('get', this.getName.bind(this));

			return [informationService, thermostatService];
		}
};
