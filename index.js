var Service;
var Characteristic;
var URL = require('url').URL;
var request = require('request');
const packageFile = require('./package.json');

function Daikin(log, config) {
  this.log = log;
  if (config.name === null) {
    this.log.error('ERROR: your configuration is missing the parameter "name"');
    this.name = 'Unnamed Daikin';
  } else {
    this.name = config.name;
  }

  if (config.apiroute === null) {
    this.log.error('ERROR: your configuration is missing the parameter "apiroute"');
    this.apiroute = 'http://192.168.1.88';
    this.apiIP = '192.168.1.88';
  } else {
    const myURL = new URL(config.apiroute);
    this.apiroute = myURL.origin;
    this.apiIP = myURL.hostname;
  }

  if (config.system === null) {
    this.log.error('ERROR: your configuration is missing the parameter "system"');
    this.system = 'Default';
  } else {
    this.system = config.system;
  }

  switch (this.system) {
    case 'Default':
      this.get_sensor_info = this.apiroute + '/aircon/get_sensor_info';
      this.get_control_info = this.apiroute + '/aircon/get_control_info';
      this.get_model_info = this.apiroute + '/aircon/get_model_info';
      this.set_control_info = this.apiroute + '/aircon/set_control_info';
      this.basic_info = this.apiroute + '/common/basic_info';
      break;

    case 'Skyfi':
      this.get_sensor_info = this.apiroute + '/skyfi/aircon/get_sensor_info';
      this.get_control_info = this.apiroute + '/skyfi/aircon/get_control_info';
      this.get_model_info = this.apiroute + '/skyfi/aircon/get_model_info';
      this.set_control_info = this.apiroute + '/skyfi/aircon/set_control_info';
      this.basic_info = this.apiroute + '/skyfi/common/basic_info';
      break;

    default:
      this.get_sensor_info = this.apiroute + '/aircon/get_sensor_info';
      this.get_control_info = this.apiroute + '/aircon/get_control_info';
      this.get_model_info = this.apiroute + '/aircon/get_model_info';
      this.set_control_info = this.apiroute + '/aircon/set_control_info';
      this.basic_info = this.apiroute + '/common/basic_info';
      break;
  }

  this.log.debug('Get sensor info %s', this.get_sensor_info);
  this.log.debug('Get control %s', this.get_control_info);
  this.log.debug('Get model info %s', this.get_model_info);
  this.log.debug('Get basic info %s', this.basic_info);

  this.firmwareRevision = packageFile.version;

  // Characteristic.TemperatureDisplayUnits.CELSIUS = 0;
  // Characteristic.TemperatureDisplayUnits.FAHRENHEIT = 1;
  this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
  this.temperature = 19;
  // this.relativeHumidity = 0.70;
  // The value property of CurrentHeatingCoolingState must be one of the following:
  // Characteristic.CurrentHeatingCoolingState.OFF = 0;
  // Characteristic.CurrentHeatingCoolingState.HEAT = 1;
  // Characteristic.CurrentHeatingCoolingState.COOL = 2;
  this.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
  this.targetTemperature = 21;
  // this.targetRelativeHumidity = 0.5;
  this.heatingThresholdTemperature = 19;
  this.coolingThresholdTemperature = 22;
  // The value property of TargetHeatingCoolingState must be one of the following:
  // Characteristic.TargetHeatingCoolingState.OFF = 0;
  // Characteristic.TargetHeatingCoolingState.HEAT = 1;
  // Characteristic.TargetHeatingCoolingState.COOL = 2;
  // Characteristic.TargetHeatingCoolingState.AUTO = 3;
  this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;

  // ??
  this.getCurrentHeatingCoolingState(function () {});
  
  
  


  this.fanStatus = true;
  this.rawFanSpeed = 0;
  this.getFanStatus(function () {});
//   this.getFanSpeed(function () {});

  this.log.info('**************************************************************');
  this.log.info('  homebridge-daikin-local version ' + packageFile.version);
  this.log.info('  GitHub: https://github.com/cbrandlehner/homebridge-daikin-local ');
  this.log.info('**************************************************************');
  this.log.info('start success...');
  this.log.info('accessory name: ' + this.name);
  this.log.info('accessory ip: ' + this.apiIP);
  this.log.info('system: ' + this.system);
  this.log.debug('Debug mode enabled');

  this.ThermostatService = new Service.Thermostat(this.name);
  this.FanService = new Service.Fan(this.nameFan);
}

function escapeRegExp(str) {
	return str.replace(/([.*+?^=!:${}()|\[\]\/\\]\")/g, '\\$1');
	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_Special_Characters
}

function replaceAll(str, find, replace) {
	return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
	// From http://stackoverflow.com/a/1144788
}

function convertDaikinToJSON(input) {
  // Daikin systems respond with HTTP response strings, not JSON objects. JSON is much easier to
  // parse, so we convert it with some RegExp here.
  var stageOne;
  var stageTwo;
  stageOne = replaceAll(input, '\=', '\":\"');
  stageTwo = replaceAll(stageOne, ',', '\",\"');
  return '{\"' + stageTwo + '\"}';
}

Daikin.prototype = {
	httpRequest: function (url, body, method, username, password, sendimmediately, callback) {
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
			function (error, response, body) {
				callback(error, response, body);
			});
	},
	// Start
	identify: function (callback) {
		this.log.info('Identify requested, however there is no way to let your Daikin WIFI module speak up for identification!');
		callback(null);
	},
	daikinSpeedToRaw: function(daikinSpeed){
		var raw = 0;
		this.log('daikinSpeed:' + daikinSpeed);

		switch (daikinSpeed){
			case "A":
				raw = 0;
			break;
			case "B":
				raw = 0;
			break;
			case "3":
				raw = 20;
			break;
			case "4":
				raw = 40;			
			break;
			case "5":
				raw = 60;			
			break;
			case "6":
				raw = 80;			
			break;										
			case "7":
				raw = 100;
			break;
		}
		return raw;
	},
	getFanStatus: function (callback) {
		this.log.info('get fan status');
		callback(null, this.fanStatus); // success

	},
	setFanStatus: function (value,callback) {
		this.log.info('set fan status');
		this.log.info(value);
		this.fanStatus = value;
		this.log.debug('set fanstatus %b', this.fanStatus);
		var cBack = this.setDaikinMode();
		callback(null);
	},		
	getFanSpeed: function (callback) {
		this.log.info('get fan speed');
		callback(null, this.rawFanSpeed); // success
	},	
	setFanSpeed: function (value,callback) {
		this.log.info('set fan speed');
		this.log.info(value);
		this.rawFanSpeed = value;
		this.log.debug('set fan speed %b', this.rawFanSpeed);
		var cBack = this.setDaikinMode();
		callback(null);
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
	setCoolingThresholdTemperature: function(value,callback) {
		this.coolingThresholdTemperature = Math.round(value * 2) / 2;
		var middleValue = this.coolingThresholdTemperature + ((this.heatingThresholdTemperature - this.coolingThresholdTemperature) / 2);
		middleValue = Math.round(middleValue);
	    this.targetTemperature = middleValue;
		this.log.info('set Threshold Temp: ', this.targetTemperature);
	    
		var cBack = this.setDaikinMode();
		callback(null);
	},
	setHeatingThresholdTemperature: function(value,callback) {
		this.heatingThresholdTemperature = Math.round(value * 2) / 2;
		var middleValue = this.coolingThresholdTemperature + ((this.heatingThresholdTemperature - this.coolingThresholdTemperature) / 2);
		middleValue = Math.round(middleValue);
	    this.targetTemperature = middleValue;
		this.log.info('set Threshold Temp: ', this.targetTemperature);

		var cBack = this.setDaikinMode();
		callback(null);
	},	

  // Required
	getCurrentHeatingCoolingState: function (callback) {
		this.log.debug('getCurrentHeatingCoolingState: reading from: ', this.get_control_info);
		request.get(
			{
				url: this.get_control_info,
				headers: {
            	     'User-Agent': 'request', Host: this.apiIP
            	}
			}, 
			function (err, response, body) {
			if (!err && response.statusCode === 200) {
				this.log.debug('Body %s', body);
				if (body.indexOf('ret=OK') === -1) {
					this.log.error('getCurrentHeatngCoolingState: Not connected to a supported Daikin wifi controller!');
				} else {
					var json = JSON.parse(convertDaikinToJSON(body)); // {"pow":"1","mode":3,"stemp":"21","shum":"34.10"}
					this.log.debug('getCurrentHeatingCoolingState: Operation mode is %s power is %s', json.mode, json.pow);
					if (json.pow === '0') {
						// The Daikin is off
						this.log.info('getCurrentHeatingCoolingState: Daikin is OFF');
						this.state = Characteristic.CurrentHeatingCoolingState.OFF;
						this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
					} else if (json.pow === '1') {
						// The Daikin is on
						switch (json.mode) {
						  // Commented cases exist for the Daikin, but not for HomeKit.
						  // Keeping for reference while I try come up with a way to include them
						  case '2':
						  this.log('Operation mode is: DRY');
						  this.state = Characteristic.TargetHeatingCoolingState.DRY;
						  break;
						
						  case '3':
						  this.log('Operation mode is: COOL');
						  this.state = Characteristic.CurrentHeatingCoolingState.COOL;
						  this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.COOL;
						  break;
						
						  case '4':
						  this.log('Operation mode is: HEAT');
						  this.state = Characteristic.CurrentHeatingCoolingState.HEAT;
						  this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.HEAT;
						  break;
						
						  case '6':
						  this.log('Operation mode is: FAN');
						  this.state = Characteristic.TargetHeatingCoolingState.FAN;
						  break;
						
						  default:
						  this.state = Characteristic.CurrentHeatingCoolingState.AUTO;
						  this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;
						  this.log('Auto (if 0, 1 or 5), or not handled case:', json.mode);
						  break;
						}
						switch (json.f_rate) {
							case 'A':
								this.log('Fan speed is: auto');
								this.fanStatus = false;
							break;
							default:
								this.fanStatus = true;
							break;
						}
						this.rawFanSpeed = this.daikinSpeedToRaw(json.f_rate);

					}
				}
				callback(null, this.state); // success
			} else {
				this.log.error('getCurrentHeatingCoolingState: Error getting operation mode: %s', err);
				callback(err);
			}
		}.bind(this));
	},
	getTargetHeatingCoolingState: function (callback) {
		this.log.info('getTargetHeatingCoolingState:', this.targetHeatingCoolingState);
		var error = null;
		callback(error, this.targetHeatingCoolingState);
	},
	setTargetHeatingCoolingState: function (value, callback) {
		this.log.info('Changing operation mode from ' + this.targetHeatingCoolingState + ' to ' + value);
		this.targetHeatingCoolingState = value;
		var cBack = this.setDaikinMode();
		callback(cBack);
	},
	getCurrentTemperature: function (callback) {
		this.log.debug('getCurrentTemperature: reading from: ', this.get_sensor_info);
		request.get({
			url: this.get_sensor_info,
      headers: {
                 'User-Agent': 'request', Host: this.apiIP
                }
		}, function (err, response, body) {
			if (!err && response.statusCode === 200) {
        if (body.indexOf('ret=OK') === -1) {
            this.log.error('getCurrentTemperature: Not connected to a supported Daikin wifi controller!');
            this.log.debug('Response is %s', body);
          } else {
            var json = JSON.parse(convertDaikinToJSON(body)); // {"ret":"OK","htemp":"24.0","hhum""-","otemp":"-","err":"0","cmpfreq":"0"}
            this.log.debug('getCurrentTemperature: Daikin operation mode is %s, currently %s degrees', this.currentHeatingCoolingState, json.htemp);
            this.temperature = parseFloat(json.htemp);
          }

				callback(null, this.temperature); // success
			} else {
				this.log.error('getCurrentTemperature: Error reading temperature: %s', err);
				callback(err);
			}
		}.bind(this));
	},
	getTargetTemperature: function (callback) {
		this.log.debug('getTargetTemperature: reading from: ', this.get_control_info);
		request.get({
			url: this.get_control_info,
      headers: {
                 'User-Agent': 'request', Host: this.apiIP
                }
		}, function (err, response, body) {
			if (!err && response.statusCode === 200) {
        if (body.indexOf('ret=OK') === -1) {
            this.log.error('Not connected to a supported Daikin wifi controller!');
            this.log.debug('Response is %s', body);
          } else {
            var json = JSON.parse(convertDaikinToJSON(body)); // {"state":"OFF","stateCode":5,"temperature":"18.10","humidity":"34.10"}
            if (json.stemp === 'M') {
              // In mode DRY there is no target temperature , instead the value is "M" as "Max".
              this.log.debug('getTargetTemperature: Target temperature is set to MAX');
            } else {
              this.targetTemperature = parseFloat(json.stemp);
              this.coolingThresholdTemperature = this.targetTemperature + 5;
              this.heatingThresholdTemperature = this.targetTemperature - 5;
              this.log.debug('getTargetTemperature: Target temperature is %s degrees', this.targetTemperature);
			  this.log.info('getTargetCoolingThreshold: Target temperature is %s degrees', this.coolingThresholdTemperature);
			  this.log.info('getTargetHeatingThreshold: Target temperature is %s degrees', this.heatingThresholdTemperature);

            }
        }

				callback(null, this.targetTemperature); // success
			} else {
				this.log.error('Error reading target temperature: %s', err);
				callback(err);
			}
		}.bind(this));
	},
	setTargetTemperature: function (value, callback) {
		// this.log("TargetTemperature to " + value);
    // round value to nearest .5 values
    this.targetTemperature = Math.round(value * 2) / 2;
    this.log('Setting target temperature to %s degrees', this.targetTemperature);
		var cBack = this.setDaikinMode();
		callback(cBack);
	},
	getTemperatureDisplayUnits: function (callback) {
		this.log('Temperature unit is %s. 0=Celsius, 1=Fahrenheit.', this.temperatureDisplayUnits);
		var error = null;
		callback(error, this.temperatureDisplayUnits);
	},
	setTemperatureDisplayUnits: function (value, callback) {
		this.log('Changing temperature unit from %s to %s', this.temperatureDisplayUnits, value);
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
	TargetRelativeHumidity: function(value, callback) {
		this.log("TargetRelativeHumidity from/to :", this.targetRelativeHumidity, value);
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
	},
  */

	getName: function (callback) {
		this.log('getName :', this.name);
		var error = null;
		callback(error, this.name);
	},
	getFanName: function (callback) {
		var error = null;
		callback(error, "Daikin FAN");
	},
	getServices: function () {
		// you can OPTIONALLY create an information service if you wish to override
		// the default values for things like serial number, model, etc.
		var informationService = new Service.AccessoryInformation();

		this.getModelInfo();

		informationService
			.setCharacteristic(Characteristic.Manufacturer, 'Daikin')
			.setCharacteristic(Characteristic.Model, this.model)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision)
			.setCharacteristic(Characteristic.SerialNumber, this.firmwareRevision); // As the Apple HOME app does not display firmware version for accessories, I am using the serial number instead.

		// Required Characteristics
		this.ThermostatService
			.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', this.getCurrentHeatingCoolingState.bind(this));

		this.ThermostatService
			.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.on('get', this.getTargetHeatingCoolingState.bind(this))
			.on('set', this.setTargetHeatingCoolingState.bind(this));

		this.ThermostatService
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getCurrentTemperature.bind(this));

		this.ThermostatService
			.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', this.getTargetTemperature.bind(this))
			.on('set', this.setTargetTemperature.bind(this));

		this.ThermostatService
			.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('get', this.getTemperatureDisplayUnits.bind(this))
			.on('set', this.setTemperatureDisplayUnits.bind(this));

		// Optional Characteristics
		/*
		this.ThermostatService
			.getCharacteristic(Characteristic.CurrentRelativeHumidity)
			.on('get', this.getCurrentRelativeHumidity.bind(this));

		this.ThermostatService
			.getCharacteristic(Characteristic.TargetRelativeHumidity)
			.on('get', this.getTargetRelativeHumidity.bind(this))
			.on('', this.TargetRelativeHumidity.bind(this));
		*/

		this.ThermostatService
			.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.on('get', this.getCoolingThresholdTemperature.bind(this))
			.on('set', this.setCoolingThresholdTemperature.bind(this));

		this.ThermostatService
			.getCharacteristic(Characteristic.HeatingThresholdTemperature)
			.on('get', this.getHeatingThresholdTemperature.bind(this))
			.on('set', this.setHeatingThresholdTemperature.bind(this));
		
		this.ThermostatService
			.getCharacteristic(Characteristic.Name)
			.on('get', this.getName.bind(this));

		this.FanService
			.getCharacteristic(Characteristic.Name)
			.on('get', this.getFanName.bind(this));

		this.FanService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getFanStatus.bind(this))
			.on('set', this.setFanStatus.bind(this));
			
		this.FanService
			.getCharacteristic(Characteristic.RotationSpeed)
			.on('get', this.getFanSpeed.bind(this))
			.on('set', this.setFanSpeed.bind(this));
						
		return [informationService, this.ThermostatService, this.FanService];
	},

	setDaikinMode: function () {
		// The Daikin doesn't always respond when you only send one parameter, so this is a catchall to send everything at once
		var pow; // 0 or 1
		var mode; // 0, 1, 2, 3, 4, 6 or 7
		var sTemp; // Int for degrees in Celcius
		var result;
		var f_rate; //"A","B",3,4,5,6,7

		// This s up the Power FAN
		if (!this.fanStatus){  //if set to off, we activate the AUTO mode for fan
			f_rate = "A";
		}else{
			if (this.rawFanSpeed > 0 && this.rawFanSpeed <=5){  //from 1% to 5%, we set the SILENT mode
				f_rate="B";
			}else if (this.rawFanSpeed > 5 && this.rawFanSpeed <20){
				f_rate="3";
			}else if (this.rawFanSpeed >= 20 && this.rawFanSpeed <40){
				f_rate="4";				
			}else if (this.rawFanSpeed >= 40 && this.rawFanSpeed <60){
				f_rate="5";				
			}else if (this.rawFanSpeed >= 60 && this.rawFanSpeed <80){
				f_rate="6";				
			}else if (this.rawFanSpeed >= 8 && this.rawFanSpeed <= 100){
				f_rate="7";
			}
		}
		if(typeof f_rate == "undefined"){
			f_rate = "A";
			this.fanStatus = false;
		}

		// This s up the Power and Mode parameters
		switch (this.targetHeatingCoolingState) {
			case Characteristic.TargetHeatingCoolingState.OFF:
				pow = '?pow=0';
      			if (this.model === 'FDXM35F3V1B') {
      			  mode = '';
      			  this.log.debug('Special handling for FDXM35F3V1B applied.');
      			  this.log('Setting POWER to OFF and TARGET TEMPERATURE to %s (FDXM35F3V1B special condition)', this.targetTemperature);
      			} else {
      			  mode = '&mode=0';
      			  this.log('Setting POWER to OFF, MODE to OFF and TARGET TEMPERATURE to %s (%s)', this.targetTemperature, this.model);
      			}

	  		break;

			case Characteristic.TargetHeatingCoolingState.HEAT: // "4"
				pow = '?pow=1';
				mode = '&mode=4';
				this.log('Setting POWER to ON, MODE to HEAT and TARGET TEMPERATURE to %s (%s)', this.targetTemperature, this.model);
			break;

			case Characteristic.TargetHeatingCoolingState.AUTO: // "0, 1, 5 or 7"
				pow = '?pow=1';
				if (this.model === 'FDXM35F3V1B') {
					mode = '&mode=1';
					this.log('Setting POWER to ON, MODE to AUTO and TARGET TEMPERATURE to %s (FDXM35F3V1B special condition)', this.targetTemperature);
				} else {
					mode = '&mode=0';
					this.log('Setting POWER to ON, MODE to AUTO and TARGET TEMPERATURE to %s (%s)', this.targetTemperature, this.model);
      			}

			break;

			case Characteristic.TargetHeatingCoolingState.COOL: // "3"
				pow = '?pow=1';
				mode = '&mode=3';
				this.log('Setting POWER to ON, MODE to COOL and TARGET TEMPERATURE to %s (%s)', this.targetTemperature, this.model);
			break;

			default:
				pow = '?pow=0';
				mode = '&mode=0';
				this.log.warn('Not handled case: %s (%s)', this.targetHeatingCoolingState, this.model);
			break;
		}

		// This is the Target Temperature parameter
    if (isNaN(this.targetTemperature)) {
        // If the Daikin mode is DRY, there is no Target Temperature set.
        sTemp = '';
    } else {
      //
      sTemp = '&stemp=' + this.targetTemperature;
    }

		// Finally, we send the command
		this.log.debug('DaikinMode: Setting pow to ' + pow + ', mode to ' + mode + ' and stemp to ' + sTemp);
    this.log.debug('DaikinMode: URL is: ' + this.set_control_info + pow + mode + sTemp + '&shum=0' + '&f_rate=' + f_rate);
	this.log('DaikinMode: URL is: ' + this.set_control_info + pow + mode + sTemp + '&shum=0' + '&f_rate=' + f_rate);

    request.get({
			url: this.set_control_info + pow + mode + sTemp + '&shum=0' + '&f_rate=' + f_rate,
      headers: {
                 'User-Agent': 'request', Host: this.apiIP
                }
		}, function (err, response, body) {
			if (!err && response.statusCode === 200) {
				// this.log("response success");
				result = null; // success
			} else {
				this.log.error('setDaikinMode: Error setting state: %s', err);
        this.log.debug('Response is %s', body);
				result = err;
			}
		}.bind(this));
		return result;
	},

	getModelInfo: function () {
		// A parser for the model details will be coded here, returning the Firmware Revision, and if not  in the config
		// file, the Name and Model as well
    // 'Host' : '192.168.71.135',
		request.get({
			url: this.get_model_info,
      headers: {
                 'User-Agent': 'request', Host: this.apiIP
                }

		}, function (err, response, body) {
			if (!err && response.statusCode === 200) {
				this.log('Successfully established connection.');
        if (body.indexOf('ret=OK') === -1) {
            this.log.error('Not connected to a supported Daikin wifi controller!');
            this.log.debug('Response is %s', body);
          } else {
            var json = JSON.parse(convertDaikinToJSON(body)); // {"pow":"1","mode":3,"stemp":"21","shum":"34.10"}
            if (json.model !== 'NOTSUPPORT') {
              this.model = json.model;
              this.log.info('Your Daikin WIFI controllers model: ' + json.model);
            }
          }
			} else {
				this.log.error('Error getting model info: %s', err);
			}
		}.bind(this));

		request.get({
			url: this.basic_info,
      headers: {
                 'User-Agent': 'request', Host: this.apiIP
                }
		}, function (err, response, body) {
			if (!err && response.statusCode === 200) {
        this.log.debug('Body: %s', body);
        if (body.indexOf('ret=OK') === -1) {
          this.log.error('Not connected to a supported Daikin wifi controller!');
          this.log.debug('Response is %s', body);
        } else {
          var json = JSON.parse(convertDaikinToJSON(body)); // {"pow":"1","mode":3,"stemp":"21","shum":"34.10"}
          this.firmwareRevision = replaceAll(json.ver, '_', '.');
          this.log('The firmware version is ' + this.firmwareRevision);
        }

        // if (this.name == "Default Daikin") {
        // Need to convert a series of Hexadecimal values to ASCII characters here
				// }
			} else {
				this.log.error('Error getting firmware info: %s', err);
			}
		}.bind(this));
	},

	getControlInfo: function () {
		// A parser for the control details from the Daikin will be coded here. It will also record all info returned in
		// the get_control_info calls, so that the plugin behaves a little more like the Daikin app/remote controls,
		// such as remembering each mode's last temperature and reusing it when changing modes
	}
};

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-daikin-local', 'Daikin-Local', Daikin);
};
