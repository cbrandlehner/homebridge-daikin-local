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

	//Characteristic.TemperatureDisplayUnits.CELSIUS = 0;
	//Characteristic.TemperatureDisplayUnits.FAHRENHEIT = 1;
	this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
	this.temperature = 19;
	this.relativeHumidity = 0.70;
	// The value property of CurrentHeatingCoolingState must be one of the following:
	//Characteristic.CurrentHeatingCoolingState.OFF = 0;
	//Characteristic.CurrentHeatingCoolingState.HEAT = 1;
	//Characteristic.CurrentHeatingCoolingState.COOL = 2;
	this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.HEAT;
	this.targetTemperature = 21;
	this.targetRelativeHumidity = 0.5;
	this.heatingThresholdTemperature = 22;
	this.coolingThresholdTemperature = 19;
	// The value property of TargetHeatingCoolingState must be one of the following:
	//Characteristic.TargetHeatingCoolingState.OFF = 0;
	//Characteristic.TargetHeatingCoolingState.HEAT = 1;
	//Characteristic.TargetHeatingCoolingState.COOL = 2;
	//Characteristic.TargetHeatingCoolingState.AUTO = 3;
	this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;
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
		this.log("getCurrentHeatingCoolingState :", this.heatingCoolingState);		
		var error = null;
		callback(error, this.heatingCoolingState);
	},
	setTargetHeatingCoolingState: function(value, callback) {
		this.log("setTargetHeatingCoolingState from/to:", this.targetHeatingCoolingState, value);
		this.targetHeatingCoolingState = value;
		callback();
	},
	getCurrentTemperature: function(callback) {
		this.log("getCurrentTemperature :", this.temperature);
		var error = null;
		callback(error, this.temperature);
	},
	setTargetTemperature: function(value, callback) {
		this.log("setTargetTemperature from/to", this.targetTemperature, value);
		this.targetTemperature = value;
		callback();
	},
	getTemperatureDisplayUnits: function(callback) {
		this.log("getTemperatureDisplayUnits :", this.temperatureDisplayUnits);
		var error = null;
		callback(error, this.temperatureDisplayUnits);
	},

	// Optional
	getCurrentRelativeHumidity: function(callback) {
		this.log("getCurrentRelativeHumidity :", this.relativeHumidity);
		var error = null;
		callback(error, this.relativeHumidity);
	},
	setTargetRelativeHumidity: function(value, callback) {
		this.log("setTargetRelativeHumidity from/to :", this.targetRelativeHumidity, value);
		this.targetRelativeHumidity = value;
		callback();
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
