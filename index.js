/* eslint no-unused-vars: ["warn", {"args": "none"}  ] */
let Service;
let Characteristic;
const superagent = require('superagent');
const Throttle = require('superagent-throttle');
const Cache = require('./cache');
const Queue = require('./queue');
const packageFile = require('./package.json');

function Daikin(log, config) {
  this.log = log;

  this.cache = new Cache();
  this.queue = new Queue();

  this.throttle = new Throttle({
    active: true, // set false to pause queue
    rate: 1, // how many requests can be sent every `ratePer`
    ratePer: 500, // number of ms in which `rate` requests may be sent
    concurrent: 1 // how many requests can be sent concurrently
  });

  if (config.name === undefined) {
    this.log.error('ERROR: your configuration is missing the parameter "name"');
    this.name = 'Unnamed Daikin';
  } else {
    this.name = config.name;
    this.log.debug('Config: AC name is %s', config.name);
  }

  if (config.fanName === undefined && config.fanMode === undefined) {
      this.log.warn('your configuration is missing the parameter "fanName", using default');
      this.fanName = this.name.concat(' FAN');
      this.log.warn('Config: Fan name is %s', this.fanName);
  } else if (config.fanName === undefined) {
      this.log.warn('your configuration is missing the parameter "fanName", using default');
      this.fanName = this.name.concat(' ', config.fanMode);
      this.log.warn('Config: Fan name is %s', this.fanName);
  } else {
      this.fanName = config.fanName;
      this.log.debug('Config: Fan name is %s', this.fanName);
  }

  if (config.apiroute === undefined) {
    this.log.error('ERROR: your configuration is missing the parameter "apiroute"');
    this.apiroute = 'http://192.168.1.88';
    this.apiIP = '192.168.1.88';
  } else {
    const myURL = new URL(config.apiroute);
    this.apiroute = myURL.origin;
    this.apiIP = myURL.hostname;
    this.log.debug('Config: apiroute is %s', config.apiroute);
  }

    if (config.swingMode === undefined) {
    this.log.warn('WARNING: your configuration is missing the parameter "swingMode", using default');
    this.swingMode = '1';
    this.log.debug('Config: swingMode is %s', this.swingMode);
  } else {
    this.log.debug('Config: swingMode is %s', config.swingMode);
    this.swingMode = config.swingMode;
  }

  if (config.response === undefined) {
    this.log.warn('WARNING: your configuration is missing the parameter "response", using default');
    this.response = 5000;
    this.log.debug('Config: response is %s', this.response);
  } else {
    this.log.debug('Config: response is %s', config.response);
    this.response = config.response;
  }

  if (config.deadline === undefined) {
      this.log.warn('WARNING: your configuration is missing the parameter "deadline", using default');
      this.deadline = 10000;
      this.log.debug('Config: deadline is %s', this.deadline);
    } else {
      this.log.debug('Config: deadline is %s', config.deadline);
      this.deadline = config.deadline;
    }

  if (config.retries === undefined) {
      this.log.warn('WARNING: your configuration is missing the parameter "retries", using default of 5 retries');
      this.retries = 3;
      this.log.debug('Config: retries is %s', this.retries);
    } else {
      this.log.debug('Config: retries is %s', config.retries);
      this.retries = config.retries;
    }

  if (config.defaultMode === undefined) {
    this.log.warn('ERROR: your configuration is missing the parameter "defaultMode", using default');
    this.defaultMode = '1';
    this.log.debug('Config: defaultMode is %s', this.defaultMode);
  } else {
    this.log.debug('Config: defaultMode is %s', config.defaultMode);
    this.defaultMode = config.defaultMode;
  }

  if (config.defaultMode === 0) {
    this.log.error('ERROR: the parameter "defaultMode" is set to an illegal value of "0". Going to use a value of "1" (Auto) instead.');
    this.defaultMode = '1';
  }

  if (config.fanMode === 'FAN') {
      this.fanMode = '6';
      this.log.debug('Config: fanMode is %s', this.fanMode);
  } else if (config.fanMode === 'DRY') {
      this.fanMode = '2';
      this.log.debug('Config: fanMode is %s', this.fanMode);
  } else if (config.fanMode === undefined) {
      this.log.warn('ERROR: your configuration is missing the parameter "fanMode", using default');
      this.fanMode = '6';
      this.log.debug('Config: fanMode is %s', this.fanMode);
  } else {
      this.log.error('ERROR: your configuration has an invalid value for parameter "fanMode", using default');
      this.fanMode = '6';
      this.log.debug('Config: fanMode is %s', this.fanMode);
  }

  if (config.system === undefined) {
    this.log.warn('ERROR: your configuration is missing the parameter "system", using default');
    this.system = 'Default';
    this.log.debug('Config: system is %s', this.system);
  } else {
    this.log.debug('Config: system is %s', config.system);
    this.system = config.system;
  }

  if (config.disableFan === undefined || config.disableFan === false)
      this.disableFan = false;
  else
      this.disableFan = true;

  if (config.uuid === undefined)
      this.uuid = '';
    else
      this.uuid = config.uuid;

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

  this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;

  this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;

  this.log.info('*****************************************************************');
  this.log.info('  homebridge-daikin-local version ' + packageFile.version);
  this.log.info('  GitHub: https://github.com/cbrandlehner/homebridge-daikin-local ');
  this.log.info('*****************************************************************');
  this.log.info('accessory name: ' + this.name);
  this.log.info('accessory ip: ' + this.apiIP);
  this.log.debug('system: ' + this.system);
  this.log.debug('Debug mode enabled');

  this.FanService = new Service.Fan(this.fanName);
  this.heaterCoolerService = new Service.HeaterCooler(this.name);
  this.temperatureService = new Service.TemperatureSensor(this.name);
}

Daikin.prototype = {

  parseResponse(response) {
        const vals = {};
        if (response) {
            const items = response.split(',');
            const length = items.length;
            for (let i = 0; i < length; i++) {
                const keyValue = items[i].split('=');
                vals[keyValue[0]] = keyValue[1];
            }
        }

    return vals;
  },

  sendGetRequest(path, callback, options) {
    this.log.debug('attempting request: path: %s', path);

    this._queueGetRequest(path, callback, options || {});
  },

  _queueGetRequest(path, callback, options) {
    const method = options.skipQueue ? 'prepend' : 'append';

    this.log.debug(`queuing (${method}) request: path: %s`, path);

    this.queue[method](done => {
      this.log.debug('executing queued request: path: %s', path);

        this._doSendGetRequest(path, (error, response) => {
          if (error) {
            this.log.error('ERROR: Queued request to %s returned error %s', path, error);
            done();
            return;
          }

          this.log.debug('queued request finished: path: %s', path);

          // actual response callback
          callback(response);
          done();
        }, options);
    });
  },

  _doSendGetRequest(path, callback, options) {
    if (this._serveFromCache(path, callback, options))
      return;

    this.log.debug('requesting from API: path: %s', path);
    const request = superagent
      .get(path)
      .retry(this.retries) // retry 3 (default) times
      .timeout({
        response: this.response, // Wait 5 (default) seconds for the server to start sending,
        deadline: this.deadline // but allow 10 (default) seconds for the request to finish loading.
      })
      .use(this.throttle.plugin())
      .set('User-Agent', 'superagent')
      .set('Host', this.apiIP);
    if (this.uuid !== '') {
        request.set('X-Daikin-uuid', this.uuid)
            .disableTLSCerts(); // the units use a self-signed cert and the CA doesn't seem to be publicly available
    }

    request.end((error, response) => {
      if (error) {
        callback(error);
        return this.log.error('ERROR: API request to %s returned error %s', path, error);
      }

      this.log.debug('set cache: path: %s', path);
      this.cache.set(path, response.text);

      this.log.debug('responding from API: %s', response.text);
      callback(error, response.text);
      // Calling the end function will send the request
    });
  },

  _serveFromCache(path, callback, options) {
    this.log.debug('requesting from cache: path: %s', path);

    if (options.skipCache) {
      this.log.debug('cache SKIP: path: %s', path);
      return false;
    }

    if (!this.cache.has(path)) {
      this.log.debug('cache MISS: path: %s', path);
      return false;
    }

    if (this.cache.expired(path)) {
      this.log.debug('cache EXPIRED: path: %s', path);
      return false;
    }

    const cachedResponse = this.cache.get(path);

    if (cachedResponse === undefined) {
      this.log.debug('cache EMPTY: path: %s', path);
      return false;
    }

    this.log.debug('cache HIT: path: %s', path);
    this.log.debug('responding from cache: %s', cachedResponse);

    callback(null, cachedResponse);
    return true;
  },

  getActive(callback) {
        this.sendGetRequest(this.get_control_info, body => {
          const responseValues = this.parseResponse(body);
          this.log.debug('getActive: Power is: %s, Mode is %s', responseValues.pow, responseValues.mode);
          let HomeKitState = '0';
          if (responseValues.mode === '6' || responseValues.mode === '2' || responseValues.mode === '1') // If AC is in Fan-mode, or an Humidity-mode then show AC OFF in HomeKit
            HomeKitState = '0';
          else
            if (responseValues.pow === '1')
              HomeKitState = '1'; // Power is ON and the device is neither in Fan-mode nor Humidity-mode
            else
              HomeKitState = '0'; // Power is OFF
          callback(null, HomeKitState === '1' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
              });
    },

  setActive(power, callback) {
      this.sendGetRequest(this.get_control_info, body => {
        const responseValues = this.parseResponse(body);
        this.log.info('setActive: Power is %s, Mode is %s. Going to change power to %s.', responseValues.pow, responseValues.mode, power);
        let query = body.replace(/,/g, '&').replace(/pow=[01]/, `pow=${power}`);
        if (responseValues.mode === '6' || responseValues.mode === '2' || responseValues.mode === '1' || responseValues.mode === '0') {// If AC is in Fan-mode, or an Humidity-mode then use the default mode.
          switch (this.defaultMode) {
            case '1': // Auto
            this.log.warn('Auto');
              query = query
                .replace(/mode=[01234567]/, `mode=${this.defaultMode}`)
                .replace(/stemp=--/, `stemp=${responseValues.dt7}`)
                .replace(/dt3=--/, `dt3=${responseValues.dt7}`)
                .replace(/shum=--/, `shum=${'0'}`);
                break;
            case '3': // COOL
              query = query
                .replace(/mode=[01234567]/, `mode=${this.defaultMode}`)
                .replace(/stemp=--/, `stemp=${responseValues.dt7}`)
                .replace(/dt3=--/, `dt3=${responseValues.dt7}`)
                .replace(/shum=--/, `shum=${'0'}`);
                break;
                case '4': // HEAT
                  query = query
                    .replace(/mode=[01234567]/, `mode=${this.defaultMode}`)
                    .replace(/stemp=--/, `stemp=${responseValues.dt5}`)
                    .replace(/dt3=--/, `dt3=${responseValues.dt5}`)
                    .replace(/shum=--/, `shum=${'0'}`);
                    break;

                default:
          }

          query = query
            .replace(/mode=[01234567]/, `mode=${this.defaultMode}`)
            .replace(/stemp=--/, `stemp=${'25.0'}`)
            .replace(/dt3=--/, `dt3=${'25.0'}`)
            .replace(/shum=--/, `shum=${'0'}`);
        }

        this.sendGetRequest(this.set_control_info + '?' + query, response => {
          callback();
        }, {skipCache: true, skipQueue: true});
    }, {skipCache: true});
  },

  getSwingMode(callback) {
    this.sendGetRequest(this.get_control_info, body => {
      const responseValues = this.parseResponse(body);
      /* f_dir values:
      0 - No swing
      1 - Vertical swing
      2 - Horizontal swing
      3 - 3D swing
      */
      this.log.debug('getSwingMode: swing mode is: %s. 0=No swing, 1=Vertical swing, 2=Horizontal swing, 3=3D swing.', responseValues.f_dir);
      this.log.debug('getSwingMode: swing mode for HomeKit is: %s. 0=Disabled, 1=Enabled', responseValues.f_dir === '0' ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);
      callback(null, responseValues.f_dir === '0' ? Characteristic.SwingMode.SWING_DISABLED : Characteristic.SwingMode.SWING_ENABLED);
    });
  },

  setSwingMode(swing, callback) {
    this.sendGetRequest(this.get_control_info, body => {
      this.log.info('setSwingMode: HomeKit requested swing mode: %s', swing);
      if (swing !== Characteristic.SwingMode.SWING_DISABLED) swing = this.swingMode;
      let query = body.replace(/,/g, '&').replace(/f_dir=[0123]/, `f_dir=${swing}`);
      query = query.replace(/,/g, '&').replace(/b_f_dir=[0123]/, `b_f_dir=${swing}`);
      this.log.debug('setSwingMode: swing mode: %s, query is: %s', swing, query);
      this.sendGetRequest(this.set_control_info + '?' + query, response => {
        callback();
      }, {skipCache: true, skipQueue: true});
    }, {skipCache: true});
  },

  getHeaterCoolerState(callback) {
        this.sendGetRequest(this.get_control_info, body => {
              const responseValues = this.parseResponse(body);
              let status = Characteristic.CurrentHeaterCoolerState.INACTIVE;
              if (responseValues.pow === '1') {
                  switch (responseValues.mode) {
                      case '0': // Auto
                      case '1': // humidification
                      case '2': // dehumidification
                      case '6': // FAN-Mode
                          status = Characteristic.CurrentHeaterCoolerState.IDLE;
                          break;
                      case '3':
                          status = Characteristic.CurrentHeaterCoolerState.COOLING;
                          break;
                      case '4':
                          status = Characteristic.CurrentHeaterCoolerState.HEATING;
                          break;
                      default:
                          status = Characteristic.CurrentHeaterCoolerState.IDLE;
                  }
              }

              this.log.debug('getHeaterCoolerState is %s', status);
              callback(null, status);
          });
      },

  getTargetHeaterCoolerState(callback) {
        this.sendGetRequest(this.get_control_info, body => {
                const responseValues = this.parseResponse(body);
                this.log.debug('getTargetHeaterCoolerState responseValues.pow is %s', responseValues.pow);
                let status = Characteristic.TargetHeaterCoolerState.AUTO;
                if (responseValues.pow === '1') {
                    switch (responseValues.mode) {
                        case '0': // automatic
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;
                        case '1': // humidification
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;
                        case '2': // dehumidification
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;
                        case '3': // cool
                            status = Characteristic.TargetHeaterCoolerState.COOL;
                            break;
                        case '4': // heat
                            status = Characteristic.TargetHeaterCoolerState.HEAT;
                            break;
                        case '6': // AUTO or FAN
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;
                        default:
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                    }
                }

                this.log.debug('getTargetHeaterCollerState is %s', status);
                callback(null, status);
            });
        },

  setTargetHeaterCoolerState(state, callback) {
    this.log.info('setTargetHeaterCoolerState: received new state %s', state);
          this.sendGetRequest(this.get_control_info, body => {
                  const currentValues = this.parseResponse(body);
                  let mode = currentValues.mode;
                  switch (state) {
                      case Characteristic.TargetHeaterCoolerState.AUTO:
                          this.log.info('HomeKit requested the AC to operate in AUTO mode.');
                          mode = 0;
                          break;
                      case Characteristic.TargetHeaterCoolerState.COOL:
                          this.log.info('HomeKit requested the AC to operate in COOL mode.');
                          mode = 3;
                          break;
                      case Characteristic.TargetHeaterCoolerState.HEAT:
                          this.log.info('HomeKit requested the AC to operate in HEAT mode.');
                          mode = 4;
                          break;
                      default:
                          break;
                  }

                  const query = body.replace(/,/g, '&').replace(/mode=[01234567]/, `mode=${mode}`);
                  this.log.info('setTargetHeaterCoolerState: query: %s', query);
                  this.sendGetRequest(this.set_control_info + '?' + query, response => {
                      callback();
                  }, {skipCache: true, skipQueue: true});
              }, {skipCache: true});
        },

  getCurrentTemperature(callback) {
          this.log.debug('getCurrentTemperature using %s', this.get_sensor_info);
          this.sendGetRequest(this.get_sensor_info, body => {
                  const responseValues = this.parseResponse(body);
                  const currentTemperature = Number.parseFloat(responseValues.htemp);
                  callback(null, currentTemperature);
          });
        },

  getCoolingTemperature(callback) {
          this.sendGetRequest(this.get_control_info, body => {
                  const responseValues = this.parseResponse(body);
                  const coolingThresholdTemperature = Number.parseFloat(responseValues.stemp);
                  callback(null, coolingThresholdTemperature);
          });
        },

  setCoolingTemperature(temperature, callback) {
          this.sendGetRequest(this.get_control_info, body => {
          temperature = Math.round(temperature * 2) / 2; // Daikin only supports steps of 0.5 degree
          temperature = temperature.toFixed(1); // Daikin always expects a precision of 1
          const query = body
            .replace(/,/g, '&')
            .replace(/stemp=[\d.]+/, `stemp=${temperature}`)
            .replace(/dt3=[\d.]+/, `dt3=${temperature}`);
          this.sendGetRequest(this.set_control_info + '?' + query, response => {
                    callback();
                }, {skipCache: true, skipQueue: true});
            }, {skipCache: true});
        },

  getHeatingTemperature(callback) {
          this.sendGetRequest(this.get_control_info, body => {
                  const responseValues = this.parseResponse(body);
                  const heatingThresholdTemperature = Number.parseFloat(responseValues.stemp);
                  callback(null, heatingThresholdTemperature);
              });
        },

  setHeatingTemperature(temperature, callback) {
          this.sendGetRequest(this.get_control_info, body => {
            temperature = Math.round(temperature * 2) / 2; // Daikin only supports steps of 0.5 degree
            temperature = temperature.toFixed(1); // Daikin always expects a precision of 1
            const query = body
              .replace(/,/g, '&')
              .replace(/stemp=[\d.]+/, `stemp=${temperature}`)
              .replace(/dt3=[\d.]+/, `dt3=${temperature}`);
          this.sendGetRequest(this.set_control_info + '?' + query, response => {
                      callback();
                  }, {skipCache: true, skipQueue: true});
              }, {skipCache: true});
          },

  identify: function (callback) {
    this.log.info('Identify requested, however there is no way to let your Daikin WIFI module speak up for identification!');
    callback(null);
  },

  daikinSpeedToRaw: function (daikinSpeed) {
    let raw = 0;
    this.log.debug('daikinSpeedtoRaw: got vaule %s', daikinSpeed);
    switch (daikinSpeed) {
    case 'A':
      raw = 15;
      break;
    case 'B':
      raw = 5;
      break;
    case '3':
      raw = 25;
      break;
    case '4':
      raw = 35;
      break;
    case '5':
      raw = 50;
      break;
    case '6':
      raw = 70;
      break;
    case '7':
      raw = 100;
      break;
    default:
      // do nothing
      this.log.warn('daikinSpeedtoRaw: default case - this could be a problem.');
  }

  this.log.debug('daikinSpeedtoRaw: raw value is %s', raw);
  return raw;
},

rawToDaikinSpeed: function (rawFanSpeed) {
  this.log.debug('rawToDaikinSpeed: got value %s', rawFanSpeed);
  let f_rate = 'A';
  rawFanSpeed = Number(rawFanSpeed);
  this.log.debug('rawToDaikinSpeed: numberized value %s', rawFanSpeed);
  if ((rawFanSpeed > 0) && (rawFanSpeed <= 9)) {// from 1% to 5%, we set the SILENT mode
    f_rate = 'B';
  } else if ((rawFanSpeed > 9) && (rawFanSpeed < 20)) {
    f_rate = 'A';
  } else if ((rawFanSpeed >= 20) && (rawFanSpeed < 30)) {
    f_rate = '3';
  } else if ((rawFanSpeed >= 30) && (rawFanSpeed < 40)) {
    f_rate = '4';
  } else if ((rawFanSpeed >= 40) && (rawFanSpeed < 60)) {
    f_rate = '5';
  } else if ((rawFanSpeed >= 60) && (rawFanSpeed < 80)) {
    f_rate = '6';
  } else if ((rawFanSpeed >= 80) && (rawFanSpeed <= 100)) {
    f_rate = '7';
  }

  this.log.debug('rawToDaikinSpeed: Daikin Speed is %s', f_rate);
  return f_rate;
},

getFanStatus: function (callback) {
  this.sendGetRequest(this.basic_info, body => {
    const responseValues = this.parseResponse(body);
    callback(null, responseValues.pow === '1');
  });
},

getFanSpeed: function (callback) {
  this.sendGetRequest(this.get_control_info, body => {
          const responseValues = this.parseResponse(body);
          this.log.debug('getFanSpeed: body is %s', body);
          this.log.debug('getFanSpeed: f_rate is %s', responseValues.f_rate);
          const HomeKitFanSpeed = this.daikinSpeedToRaw(responseValues.f_rate);
          this.log.debug('getFanSpeed: Reporting a current FAN speed of %s Percent to HomeKit.', HomeKitFanSpeed);
          callback(null, HomeKitFanSpeed);
      });
},

  setFanStatus: function (value, callback) {
    this.log.debug('setFanStatus: HomeKit requested FAN operation state is: %s', value);
    this.sendGetRequest(this.get_control_info, body => {
      let targetPOW;
      if (value === true) {
        // value = 1;
        this.log.info('setFanStatus: HomeKit requested to turn the FAN on.');
        targetPOW = '1';
      } else {
        // value = 0;
        targetPOW = '0';
        this.log.info('setFanStatus: HomeKit requested to turn the FAN off.');
      }

      this.log.debug('setFanStatus: HomeKit requested a new state of: %s', value);
      const responseValues = this.parseResponse(body);
      this.log.debug('setFanStatus: Current Power is: %s. 0=Off, 1=On', responseValues.pow);
      this.log.debug('setFanStatus: Current Mode is: %s. 1=Auto, 2=Dehumidification, 3=Cool, 4=Heat, 6=FAN', responseValues.mode);
      let targetMode;
      targetMode = responseValues.mode;
      if (responseValues.pow === '0') {
                targetMode = 6;
                this.log.debug('setFanStatus: AC is currently powered off.');
      } // If the AC is currently off and HomeKit asks to switch the Fan on, change AC mode to Fan-MODE
       // if (responseValues.pow === '0') value = 1;

      // turn power on
      let query;

      if (targetPOW === '1') {
        if (responseValues.mode === 2) // Current Mode is Dehumidification. In this special case we keep the current state and do not switch to FAN mode.
            query = `pow=${targetPOW}&mode=${responseValues.mode}&stemp=M&shum=50&dt2=${responseValues.dt2}&dh2=${responseValues.dh2}&f_rate=${responseValues.f_rate}&f_dir=${this.swingMode}`;
        else
            query = `pow=${targetPOW}&mode=${targetMode}&stemp=${responseValues.stemp}&shum=${responseValues.shum}&dt2=${responseValues.dt2}&dh2=${responseValues.dh2}&f_rate=${responseValues.f_rate}&f_dir=${this.swingMode}`;
      } else {
            query = body
              .replace(/,/g, '&').replace(/pow=[01]/, `pow=${targetPOW}`)
              .replace(/mode=[01234567]/, `mode=${this.defaultMode}`)
              .replace(/stemp=--/, `stemp=${responseValues.dt7}`)
              .replace(/dt3=--/, `dt3=${responseValues.dt7}`)
              .replace(/shum=--/, `shum=${'0'}`);
      }

      this.log.warn('setFanStatus: going to send this query: %s', query);
      this.sendGetRequest(this.set_control_info + '?' + query, response => {
        callback();
      }, {skipCache: true, skipQueue: true});
    }, {skipCache: true});
  },

  setFanSpeed: function (value, callback) {
    this.log('setFanSpeed: HomeKit requested a FAN speed of %s Percent.', value);
    value = this.rawToDaikinSpeed(value);
    this.log.debug('setFanSpeed: this translates to Daikin f_rate value: %s', value);
    this.sendGetRequest(this.get_control_info, body => {
      let query = body.replace(/,/g, '&').replace(/f_rate=[01234567AB]/, `f_rate=${value}`);
      query = query.replace(/,/g, '&').replace(/b_f_rate=[01234567AB]/, `b_f_rate=${value}`);
      this.log.debug('setFanSpeed: Query is: %s', query);
      this.sendGetRequest(this.set_control_info + '?' + query, response => {
        callback();
      }, {skipCache: true, skipQueue: true});
    }, {skipCache: true});
  },

  getTemperatureDisplayUnits: function (callback) {
    this.log.info('getTemperatureDisplayUnits: Temperature unit is %s. 0=Celsius, 1=Fahrenheit.', this.temperatureDisplayUnits);
    const error = null;
    callback(error, this.temperatureDisplayUnits);
  },

  setTemperatureDisplayUnits: function (value, callback) {
    this.log('Changing temperature unit from %s to %s. 0=Celsius, 1=Fahrenheit.', this.temperatureDisplayUnits, value);
    this.temperatureDisplayUnits = value;
    const error = null;
    callback(error);
  },

	getServices: function () {
    const informationService = new Service.AccessoryInformation();

		this.getModelInfo();

		informationService
			.setCharacteristic(Characteristic.Manufacturer, 'Daikin')
			.setCharacteristic(Characteristic.Model, this.model)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision)
			.setCharacteristic(Characteristic.SerialNumber, this.firmwareRevision);

		this.FanService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getFanStatus.bind(this))
			.on('set', this.setFanStatus.bind(this));

		this.FanService
			.getCharacteristic(Characteristic.RotationSpeed)
			.on('get', this.getFanSpeed.bind(this))
			.on('set', this.setFanSpeed.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getActive.bind(this))
      .on('set', this.setActive.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .on('get', this.getHeaterCoolerState.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .on('get', this.getTargetHeaterCoolerState.bind(this))
      .on('set', this.setTargetHeaterCoolerState.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .on('get', this.getCoolingTemperature.bind(this))
      .on('set', this.setCoolingTemperature.bind(this))
      .setProps({minValue: Number.parseFloat('10'),
                 maxValue: Number.parseFloat('32'),
                 minStep: Number.parseFloat('0.5')});

    this.heaterCoolerService
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .on('get', this.getHeatingTemperature.bind(this))
      .on('set', this.setHeatingTemperature.bind(this))
      .setProps({minValue: Number.parseFloat('10'),
                 maxValue: Number.parseFloat('32'),
                 minStep: Number.parseFloat('0.5')});

    this.heaterCoolerService
      .getCharacteristic(Characteristic.SwingMode)
      .on('get', this.getSwingMode.bind(this))
      .on('set', this.setSwingMode.bind(this));

    this.heaterCoolerService
    .getCharacteristic(Characteristic.TemperatureDisplayUnits)
    // .on('get', this.getTemperatureDisplayUnits.bind(this))
    .on('get', function (callback) {
        if (this.temperature_unit === 'C')
            callback(null, Characteristic.TemperatureDisplayUnits.CELSIUS);
        else
            callback(null, Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
    })
    .on('set', this.setTemperatureDisplayUnits.bind(this));

    this.temperatureService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({minValue: Number.parseFloat('-50'),
                 maxValue: Number.parseFloat('100')})
      .on('get', this.getCurrentTemperature.bind(this));

    let services;
    if (this.disableFan === true)
        services = [informationService, this.heaterCoolerService, this.temperatureService];
    else
        services = [informationService, this.heaterCoolerService, this.FanService, this.temperatureService];
    return services;
  },

  getModelInfo: function () {
		// A function to prompt the model information and the firmware revision
    this.sendGetRequest(this.get_model_info, body => {
      const responseValues = this.parseResponse(body);
      this.log.debug('getModelInfo return code %s', responseValues.ret);
      this.log.debug('getModelInfo %s', responseValues.model);
      if (responseValues.ret === 'OK') {
        this.log.debug('Model reported: %s', responseValues.model);
        if (responseValues.model !== 'NOTSUPPORT') {
          this.model = responseValues.model;
          this.log.info('Your Daikin WIFI controller model: %s', responseValues.model);
        }
      } else {
       this.log.error('Not connected to a supported Daikin wifi controller!');
       this.log.warn('Response is %s', body);
      }
    });
    this.sendGetRequest(this.basic_info, body => {
      const responseValues = this.parseResponse(body);
      this.log.debug('getModelInfo for basic info return code %s', responseValues.ret);
      if (responseValues.ret === 'OK') {
        this.firmwareRevision = responseValues.ver;
        this.log('The firmware version is %s', this.firmwareRevision);
      } else {
        this.firmwareRevision = 'NOTSUPPORT';
        this.log.error('getModelInfo for basic info: Not connected to a supported Daikin wifi controller!');
        }
      });
    }
  };

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-daikin-local', 'Daikin-Local', Daikin);
};
