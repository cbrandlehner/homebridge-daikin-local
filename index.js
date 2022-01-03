//* eslint no-unused-vars: ["warn", {"args": "none"}  ] */
let Service;
let Characteristic;
const superagent = require('superagent');
const Throttle = require('superagent-throttle');
const Cache = require('./cache.js');
const Queue = require('./queue.js');
const packageFile = require('./package.json');

function Daikin(log, config) {
  this.log = log;

  this.cache = new Cache();
  this.queue = new Queue();

  this.displayUnitsDescription = ['Celsius', 'Fahrenheit'];
  this.throttle = new Throttle({
    active: true, // set false to pause queue
    rate: 1, // how many requests can be sent every `ratePer`
    ratePer: 500, // number of ms in which `rate` requests may be sent
    concurrent: 1, // how many requests can be sent concurrently
  });

  if (config.name === undefined) {
    this.log.error('ERROR: your configuration is missing the parameter "name"');
    this.name = 'Unnamed Daikin';
  } else {
    this.name = config.name;
    this.log.debug('Config: AC name is %s', config.name);
  }

  if (config.temperature_unit === undefined) {
    this.log.error('ERROR: your configuration is missing the parameter "temperature_unit"');
    this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
  } else {
    this.temperatureDisplayUnits = config.temperature_unit;
    this.log.debug('Config: temperature_unit is %s', config.temperature_unit);
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
      this.deadline = 10_000;
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
      this.log.warn('ERROR: your configuration is missing the parameter "fanMode", using default: FAN');
      this.fanMode = '6';
      this.log.debug('Config: fanMode is %s', this.fanMode);
  } else {
      this.log.error('ERROR: your configuration has an invalid value for parameter "fanMode", using default');
      this.fanMode = '6';
      this.log.debug('Config: fanMode is %s', this.fanMode);
  }

  if (config.fanPowerMode === undefined) {
        this.log.warn('ERROR: your configuration is missing the parameter "fanPowerMode", using default');
        this.fanPowerMode = false;
  } else if (config.fanPowerMode === 'FAN only') {
      this.fanPowerMode = false;
    } else {
        this.fanPowerMode = true;
    }

  if (config.fanName === undefined && config.fanMode === undefined) {
        this.log.warn('ERROR: your configuration is missing the parameter "fanName", using default');
        this.fanName = this.name + ' FAN';
        this.log.warn('Config: Fan name is %s', this.fanName);
    } else if (config.fanName === undefined) {
        this.log.warn('ERROR: your configuration is missing the parameter "fanName", using default');
        this.fanName = this.name + ' ' + config.fanMode;
        this.log.warn('Config: Fan name is %s', this.fanName);
    } else {
        this.fanName = config.fanName;
        this.log.debug('Config: Fan name is %s', this.fanName);
    }

  if (config.system === undefined) {
    this.log.warn('ERROR: your configuration is missing the parameter "system", using default: Default');
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

  if (config.enableHumiditySensor === true)
      this.enableHumiditySensor = true;
  else
      this.enableHumiditySensor = false;

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

  this.log.debug('get_sensor_info %s', this.get_sensor_info);
  this.log.debug('Get_control_info %s', this.get_control_info);
  this.log.debug('Get_model_info %s', this.get_model_info);
  this.log.debug('Get_basic_info %s', this.basic_info);

  this.firmwareRevision = packageFile.version;

  this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
  this.log.info('Display Units: ', this.displayUnitsDescription[this.temperatureDisplayUnits]);

//  this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;

  this.log.info('*****************************************************************');
  this.log.info('  homebridge-daikin-local version ' + packageFile.version);
  this.log.info('  GitHub: https://github.com/cbrandlehner/homebridge-daikin-local ');
  this.log.info('*****************************************************************');
  this.log.info('accessory name: ' + this.name);
  this.log.info('accessory ip: ' + this.apiIP);
  this.log.debug('system: ' + this.system);

  // FV 210510: Storing last values for early returns (and set defaults for first calls)
  this.HeaterCooler_Active = Characteristic.Active.INACTIVE;
  this.HeaterCooler_SwingMode = Characteristic.SwingMode.SWING_DISABLED;
  this.HeaterCooler_CurrentHeaterCoolerState = Characteristic.CurrentHeaterCoolerState.IDLE;
  this.HeaterCooler_TargetHeaterCoolerState = Characteristic.TargetHeaterCoolerState.AUTO;
  this.HeaterCooler_CurrentTemperature = 21;
  this.HeaterCooler_CoolingTemperature = 21;
  this.HeaterCooler_HeatingTemperature = 21;
  this.HeaterCooler_CurrentHumidity = 40;
  this.Fan_Speed = 15;
  this.Fan_Status = 0;
  this.counter = 0;
  this.lastMode = 3; /* cooling */
  this.lastFanSpeed = 10; /* Silent */

  // FV 2100720 adding description arrays
  this.modeDescription = ['off', 'Auto', 'Dehumidification', 'Cooling', 'Heating', 'unknown:5', 'Fan'];
  this.powerDescription = ['off', 'on'];

  this.FanService = new Service.Fan(this.fanName);
  this.heaterCoolerService = new Service.HeaterCooler(this.name);
  this.temperatureService = new Service.TemperatureSensor(this.name);
  this.humidityService = new Service.HumiditySensor(this.name);
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
            // this.log.error('ERROR: Queued request to %s returned error %s', path, error);
            if (error.code === 'ECONNRESET') {
              this.log.debug('requeueing request after econnreset');
              options.skipQueue = 'prepend';
              this._queueGetRequest(path, callback, options || {});
            }

            done();
            return;
          }

          this.log.debug('queued request finished: path: %s', path);

          // actual response callback
          if (!(typeof callback === 'undefined')) callback(response);
          done();
        }, options);
    });
  },

  _doSendGetRequest(path, callback, options) {
    if (this._serveFromCache(path, callback, options))
      return;

    this.log.debug('_doSendGetRequest: requesting from API: path: %s', path);
    const request = superagent
      .get(path)
      .retry(this.retries) // retry 3 (default) times
      .timeout({
        response: this.response, // Wait 5 (default) seconds for the server to start sending,
        deadline: this.deadline, // but allow 10 (default) seconds for the request to finish loading.
      })
      .use(this.throttle.plugin())
      .set('User-Agent', 'superagent')
      .set('Host', this.apiIP);
    if (this.uuid !== '') {
        request.set('X-Daikin-uuid', this.uuid)
            .disableTLSCerts(); // the units use a self-signed cert and the CA doesn't seem to be publicly available
    }

    request.then(response => {
         this.log.debug('_doSendGetRequest: set cache: path: %s', path);
         this.cache.set(path, response.text);
         this.log.debug('_doSendGetRequest: response from API: %s', response.text);
         if (!(typeof callback === 'undefined')) callback(null, response.text);
       })
       .catch(error => {
           if (error.timeout) { /* timed out! */ } else
           if (error.code === 'ECONNRESET') {
            this.log.debug('_doSendGetRequest: eConnreset filtered');
            } else {
               this.log.error('_doSendGetRequest: ERROR: API request to %s returned error %s', path, error);
            }

        if (!(typeof callback === 'undefined')) callback(error);
        // return;
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

    if (!(typeof callback === 'undefined')) callback(null, cachedResponse);
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
          if (!(typeof callback === 'undefined')) callback(null, HomeKitState === '1' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
        });
    },
  getActiveFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getActiveFV: early callback with cached Active: %s (%d).', this.HeaterCooler_Active, counter);
    if (!(typeof callback === 'undefined')) callback(null, this.HeaterCooler_Active);
    this.getActive((error, HomeKitState) => {
      this.HeaterCooler_Active = HomeKitState;
      this.heaterCoolerService.getCharacteristic(Characteristic.Active).updateValue(this.HeaterCooler_Active);
      this.log.debug('getActiveFV: update Active: %s (%d).', this.HeaterCooler_Active, counter);
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

        this.HeaterCooler_Active = power; // FV210510 updating Active Cache
        this.log.debug('setActive: update Active: %s.', this.HeaterCooler_Active); // FV210510
        this.sendGetRequest(this.set_control_info + '?' + query, _response => {
          this.HeaterCooler_Active = power; // FV210510 updating Active Cache
          this.log.debug('setActive: update Active: %s.', this.HeaterCooler_Active); // FV210510
          if (!(typeof callback === 'undefined')) callback();
        if (power === '0') {
          this.lastFanSpeed = this.Fan_Speed;
          this.setFanSpeed(0);
        }
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
  getSwingModeFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getSwingModeFV: early callback with cached SwingMode: %s (%d).', this.HeaterCooler_SwingMode, counter);
    callback(null, this.HeaterCooler_SwingMode);
    this.getSwingMode((error, HomeKitState) => {
      this.HeaterCooler_SwingMode = HomeKitState;
      this.heaterCoolerService.getCharacteristic(Characteristic.SwingMode).updateValue(this.HeaterCooler_SwingMode); // FV210504
      this.log.debug('getSwingModeFV: update SwingMode: %s (%d).', this.HeaterCooler_SwingMode, counter);
    });
  },

  setSwingMode(swing, callback) {
    this.sendGetRequest(this.get_control_info, body => {
      this.log.info('setSwingMode: HomeKit requested swing mode: %s', swing);
      if (swing !== Characteristic.SwingMode.SWING_DISABLED) swing = this.swingMode;
      let query = body.replace(/,/g, '&').replace(/f_dir=[0123]/, `f_dir=${swing}`);
      query = query.replace(/,/g, '&').replace(/b_f_dir=[0123]/, `b_f_dir=${swing}`);
      this.log.debug('setSwingMode: swing mode: %s, query is: %s', swing, query);
      this.HeaterCooler_SwingMode = swing; // FV210510 update cache
      this.log.debug('setSwingMode: update SwingMode: %s.', this.HeaterCooler_SwingMode); // FV210510
      this.sendGetRequest(this.set_control_info + '?' + query, _response => {
        this.HeaterCooler_SwingMode = swing; // FV210510 update cache
        this.log.debug('setSwingMode: update SwingMode: %s.', this.HeaterCooler_SwingMode); // FV210510
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
  getHeaterCoolerStateFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getHeaterCoolerStateFV: early callback with CurrentHeaterCoolerState: %s (%d).', this.HeaterCooler_CurrentHeaterCoolerState, counter);
    callback(null, this.HeaterCooler_CurrentHeaterCoolerState);
    this.getHeaterCoolerState((error, HomeKitState) => {
      this.HeaterCooler_CurrentHeaterCoolerState = HomeKitState;
      this.heaterCoolerService.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(this.HeaterCooler_CurrentHeaterCoolerState);
      this.log.debug('getHeaterCoolerStateFV: update CurrentHeaterCoolerState: %s (%d).', this.HeaterCooler_CurrentHeaterCoolerState, counter);
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
  getTargetHeaterCoolerStateFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getTargetHeaterCoolerStateFV: early callback with cached TargetHeaterCoolerState: %s (%d).', this.HeaterCooler_TargetHeaterCoolerState, counter);
    callback(null, this.HeaterCooler_TargetHeaterCoolerState);
    this.getTargetHeaterCoolerState((error, HomeKitState) => {
      this.HeaterCooler_TargetHeaterCoolerState = HomeKitState;
      this.heaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState).updateValue(this.HeaterCooler_TargetHeaterCoolerState); // FV210504
      this.log.debug('getTargetHeaterCoolerStateFV: update TargetHeaterCoolerState: %s (%d).', this.HeaterCooler_TargetHeaterCoolerState, counter);
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
                  this.HeaterCooler_TargetHeaterCoolerState = state; // FV2105010
                  this.log.debug('setTargetHeaterCoolerState: update TargetHeaterCoolerState: %s.', this.HeaterCooler_TargetHeaterCoolerState); // FV2105010
                  this.sendGetRequest(this.set_control_info + '?' + query, _response => {
                      this.HeaterCooler_TargetHeaterCoolerState = state; // FV2105010
                      this.log.debug('setTargetHeaterCoolerState: update TargetHeaterCoolerState: %s.', this.HeaterCooler_TargetHeaterCoolerState); // FV2105010
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
  getCurrentTemperatureFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getCurrentTemperatureFV: early callback with cached CurrentTemperature: %s (%d).', this.HeaterCooler_CurrentTemperature, counter);
    callback(null, this.HeaterCooler_CurrentTemperature);
    this.getCurrentTemperature((error, HomeKitState) => {
      this.HeaterCooler_CurrentTemperature = HomeKitState;
      this.heaterCoolerService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.HeaterCooler_CurrentTemperature); // FV210504
      this.log.debug('getCurrentTemperatureFV: update CurrentTemperature: %s (%d).', this.HeaterCooler_CurrentTemperature, counter);
    });
  },

  getCurrentHumidity(callback) {
            this.log.debug('getCurrentHumidity using %s', this.get_sensor_info);
            this.sendGetRequest(this.get_sensor_info, body => {
                    const responseValues = this.parseResponse(body);
                    const currentHumidity = Number.parseFloat(responseValues.hhum);
                    callback(null, currentHumidity);
            });
  },
  getCurrentHumidityFV(callback) {
    const counter = ++this.counter;
    this.log.debug('getCurrentHumidityFV: early callback with cached CurrentHumidity: %s (%d).', this.HeaterCooler_CurrentHumidity, counter);
    callback(null, this.HeaterCooler_CurrentHumidity);
    this.getCurrentHumidity((error, HomeKitState) => {
      this.HeaterCooler_CurrentHumidity = HomeKitState;
      this.log.debug('getCurrentHumidityFV: update CurrentHumidity: %s (%d).', this.HeaterCooler_CurrentHumidity, counter);
    });
  },

  getCurrentOutsideTemperature(callback) {
                this.log.debug('getCurrentOutsideTemperature using %s', this.get_sensor_info);
                this.sendGetRequest(this.get_sensor_info, body => {
                        const responseValues = this.parseResponse(body);
                        const currentOutsideTemperature = Number.parseFloat(responseValues.otemp);
                        callback(null, currentOutsideTemperature);
                });
              },

  getCoolingTemperature(callback) {
          this.sendGetRequest(this.get_control_info, body => {
                  const responseValues = this.parseResponse(body);
                  const stemp = Number.parseFloat(responseValues.stemp);
                  const dt3 = Number.parseFloat(responseValues.dt3);
                  this.log.debug('stemp: %s', stemp); // stemp usually holds the controllers target temperature
                  this.log.debug('dt3: %s', dt3); // except when it is or was in dehumidification mode, then stemp equals "M" and the temperature is in dt3.
                  let coolingThresholdTemperature;
                  if (Number.isNaN(stemp) || responseValues.stemp === 'M') // FV 16.6.21 detected that stemp is sometimes a NaN
                    coolingThresholdTemperature = dt3;
                  else
                    coolingThresholdTemperature = stemp;
                  this.log.debug('getCoolingTemperature: parsed float is %s', coolingThresholdTemperature);
                  callback(null, coolingThresholdTemperature);
          });
        },
  getCoolingTemperatureFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getCoolingTemperatureFV: cache: %s', this.HeaterCooler_CoolingTemperature);
    this.log.debug('getCoolingTemperatureFV: early callback with cached CoolingTemperature: %s (%d).', this.HeaterCooler_CoolingTemperature, counter);
    callback(null, this.HeaterCooler_CoolingTemperature);
    this.getCoolingTemperature((error, HomeKitState) => {
      this.HeaterCooler_CoolingTemperature = HomeKitState;
      this.heaterCoolerService.getCharacteristic(Characteristic.CoolingThresholdTemperature).updateValue(this.HeaterCooler_CoolingTemperature);
      this.log.debug('getCoolingTemperatureFV: update CoolingTemperature: %s (%d).', this.HeaterCooler_CoolingTemperature, counter);
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
          this.HeaterCooler_CoolingTemperature = temperature;
          this.log.debug('setCoolingTemperature: update CoolingTemperature: %s.', this.HeaterCooler_CoolingTemperature); // FV2105010
          this.sendGetRequest(this.set_control_info + '?' + query, _response => {
                    this.HeaterCooler_CoolingTemperature = temperature;
                    this.log.debug('setCoolingTemperature: update CoolingTemperature: %s.', this.HeaterCooler_CoolingTemperature); // FV2105010
                    callback();
                }, {skipCache: true, skipQueue: true});
            }, {skipCache: true});
        },

  getHeatingTemperature(callback) {
          this.sendGetRequest(this.get_control_info, body => {
                  const responseValues = this.parseResponse(body);
                  const stemp = Number.parseFloat(responseValues.stemp);
                  const dt3 = Number.parseFloat(responseValues.dt3);
                  this.log.debug('stemp: %s', stemp); // stemp usually holds the controllers target temperature
                  this.log.debug('dt3: %s', dt3); // except when it is or was in dehumidification mode, then stemp equals "M" and the temperature is in dt3.
                  let heatingThresholdTemperature;
                  if (Number.isNaN(stemp) || responseValues.stemp === 'M') // FV 16.6.21 detected that stemp is sometimes a NaN
                    heatingThresholdTemperature = dt3;
                  else
                    heatingThresholdTemperature = stemp;
                  this.log.debug('getHeatingTemperature: parsed float is %s', heatingThresholdTemperature);
                  callback(null, heatingThresholdTemperature);
              });
        },
  getHeatingTemperatureFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getHeatingTemperatureFV: early callback with cached HeatingTemperature: %s (%d).', this.HeaterCooler_HeatingTemperature, counter);
    callback(null, this.HeaterCooler_HeatingTemperature);
    this.getHeatingTemperature((error, HomeKitState) => {
      this.HeaterCooler_HeatingTemperature = HomeKitState;
      this.heaterCoolerService.getCharacteristic(Characteristic.HeatingThresholdTemperature).updateValue(this.HeaterCooler_HeatingTemperature);
      this.log.debug('getHeatingTemperatureFV: update HeatingTemperature: %s (%d).', this.HeaterCooler_HeatingTemperature, counter);
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
          this.HeaterCooler_HeatingTemperature = temperature;
          this.log.debug('setHeatingTemperature: update HeatingTemperature: %s.', this.HeaterCooler_HeatingTemperature); // FV2105010
          this.sendGetRequest(this.set_control_info + '?' + query, _response => {
                      this.HeaterCooler_HeatingTemperature = temperature;
                      this.log.debug('setHeatingTemperature: update HeatingTemperature: %s.', this.HeaterCooler_HeatingTemperature); // FV2105010
                      callback();
                  }, {skipCache: true, skipQueue: true});
              }, {skipCache: true});
          },

  identify: function (callback) {
    this.log.info('Identify requested, however there is no way to let your Daikin WIFI module speak up for identification!');
    callback(null);
  },

  daikinSpeedToRaw: function (daikinSpeed) {
    let raw = 5; // FV 16.6.2021 Setting minimum Speed for default value below...
    this.log.debug('daikinSpeedtoRaw: got value %s', daikinSpeed);
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
  getFanStatusFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getFanStatusFV: early callback with cached Status: %s (%d).', this.powerDescription[this.Fan_Status], counter);
    callback(null, this.Fan_Status);
    this.getFanStatus((error, HomeKitState) => {
      this.Fan_Status = HomeKitState;
      this.FanService.getCharacteristic(Characteristic.On).updateValue(this.Fan_Status); // FV210504
      this.log.debug('getFanStatusFV: update Status: %s (%d).', this.powerDescription[this.Fan_Status], counter);
    });
  },

  setFanStatus: function (value, callback) {
    let targetPOW = 0;
    if (value === true)
      targetPOW = 1;

    /* Get current state from daikin */
    this.sendGetRequest(this.get_control_info, body => {
      const responseValues = this.parseResponse(body);
      let currentPOW = 0;
      if (responseValues.pow === '1')
        currentPOW = 1;

      const targetFanMode = this.fanMode; // FAN or Dehumidify */
      this.log.info('setFanStatus: HomeKit requested  to turn the FAN %s.', this.powerDescription[targetPOW]);
      this.log.debug('setFanStatus: Current Power is: %s.', this.powerDescription[currentPOW]);
      this.log.debug('setFanStatus: Current Mode is: %s.', this.modeDescription[responseValues.mode]);

      if (targetPOW === currentPOW) {
        this.log.debug('setFanStatus: Powerstate did not change, ignore it.');
        if (!(typeof callback === 'undefined')) callback();
        return;
      }

     if (targetPOW === 0) {
       /* Powering off */
       if (this.fanPowerMode === false) {
           if ((responseValues.mode === '2') || (responseValues.mode === '6')) {
               this.log.debug('setFanStatus: fanPowerMode is "FAN only" and mode is a FAN Mode => Power off device.');
               this.setActive(0);
             } else {
               this.log.debug('setFanStatus: fanPowerMode is "FAN only" and mode is NOT a FAN Mode => Ignore it.');
           }
       } else {
           this.log.debug('setFanStatus: fanPowerMode is "complete Device", shutting down device.');
           this.setActive(0);
       }

       if (!(typeof callback === 'undefined')) callback();
       return;
     }
     // turn power on

     if (this.fanPowerMode === true) {
       this.log.debug('setFanStatus: fanPowerMode is "complete Device" => power on Device.');
       this.setActive(1);
       if (!(typeof callback === 'undefined')) callback();
       return;
     }

     this.log.info('setFanStatus: fanPowerMode is "FAN only", power on Device in configured FAN mode.');

     const query = `pow=${targetPOW}&mode=${targetFanMode}&stemp=${responseValues.stemp}&shum=${responseValues.shum}&dt2=${responseValues.dt2}&dh2=${responseValues.dh2}&f_rate=${responseValues.f_rate}&f_dir=${this.swingMode}`;
     this.log.debug('setFanStatus: going to send this query: %s', query);
     this.Fan_Status = targetPOW; // FV2105010
     this.log.debug('setFanStatus: update Status: %s.', this.powerDescription[this.Fan_Status]); // FV2105010
     this.sendGetRequest(this.set_control_info + '?' + query, _response => {
        if (!(typeof callback === 'undefined')) callback();
      }, {skipCache: true, skipQueue: true});
    }, {skipCache: true});
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
  getFanSpeedFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getFanSpeedFV: early callback with cached Speed: %s (%d).', this.Fan_Speed, counter);
    callback(null, this.Fan_Speed);
    this.getFanSpeed((error, HomeKitState) => {
      this.Fan_Speed = HomeKitState;
      this.FanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(this.Fan_Speed); // FV210504
      this.log.debug('getFanSpeedFV: update Speed: %s (%d).', this.Fan_Speed, counter);
    });
  },

  setFanSpeed: function (value, callback) {
    this.log.info('setFanSpeed: HomeKit requested a FAN speed of %s Percent.', value);
    value = this.rawToDaikinSpeed(value);
    this.log.debug('setFanSpeed: this translates to Daikin f_rate value: %s', value);
    this.sendGetRequest(this.get_control_info, body => {
      let query = body.replace(/,/g, '&').replace(/f_rate=[01234567AB]/, `f_rate=${value}`);
      query = query.replace(/,/g, '&').replace(/b_f_rate=[01234567AB]/, `b_f_rate=${value}`);
      this.log.debug('setFanSpeed: Query is: %s', query);
      this.Fan_Speed = this.daikinSpeedToRaw(value); // FV2105010
      this.log.debug('setFanSpeed: update Speed: %s.', this.Fan_Speed); // FV2105010
      this.sendGetRequest(this.set_control_info + '?' + query, _response => {
        if (!(typeof callback === 'undefined')) callback();
      }, {skipCache: true, skipQueue: true});
    }, {skipCache: true});
  },

  getTemperatureDisplayUnits: function (callback) {
    this.log.debug('getTemperatureDisplayUnits: Temperature unit is %s.', this.displayUnitsDescription[this.temperatureDisplayUnits]);
    const error = null;
    callback(error, this.temperatureDisplayUnits);
  },

  setTemperatureDisplayUnits: function (value, callback) {
    this.log.warn('Changing temperature unit from %s to %s.', this.displayUnitsDescription[this.temperatureDisplayUnits], this.displayUnitsDescription[value]);
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
			.on('get', this.getFanStatusFV.bind(this))
			.on('set', this.setFanStatus.bind(this));

		this.FanService
			.getCharacteristic(Characteristic.RotationSpeed)
			.on('get', this.getFanSpeedFV.bind(this))
			.on('set', this.setFanSpeed.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getActiveFV.bind(this))
      .on('set', this.setActive.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .on('get', this.getHeaterCoolerStateFV.bind(this)); // FV 210510

    this.heaterCoolerService
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .on('get', this.getTargetHeaterCoolerStateFV.bind(this))
      .on('set', this.setTargetHeaterCoolerState.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperatureFV.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .setProps({minValue: Number.parseFloat('10'),
                 maxValue: Number.parseFloat('32'),
                 minStep: Number.parseFloat('0.5')})
      .on('get', this.getCoolingTemperatureFV.bind(this))
      .on('set', this.setCoolingTemperature.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({minValue: Number.parseFloat('10'),
                 maxValue: Number.parseFloat('32'),
                 minStep: Number.parseFloat('0.5')})
      .on('get', this.getHeatingTemperatureFV.bind(this))
      .on('set', this.setHeatingTemperature.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.SwingMode)
      .on('get', this.getSwingModeFV.bind(this)) // FV210510
      .on('set', this.setSwingMode.bind(this));

    this.heaterCoolerService
    .getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .on('get', this.getTemperatureDisplayUnits.bind(this))
    .on('set', this.setTemperatureDisplayUnits.bind(this));

    this.temperatureService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({minValue: Number.parseFloat('-50'),
                 maxValue: Number.parseFloat('100')})
      .on('get', this.getCurrentTemperatureFV.bind(this));

    if (this.enableHumiditySensor) {
      this.humidityService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .setProps({minValue: Number.parseFloat('0'),
                  maxValue: Number.parseFloat('100')})
        .on('get', this.getCurrentHumidityFV.bind(this));
    }

    const services = [informationService, this.heaterCoolerService, this.temperatureService];
    if (this.disableFan === false)
      services.splice(services.indexOf(this.temperatureService), 0, this.FanService);
    if (this.enableHumiditySensor === true)
      services.push(this.humidityService);
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
    },
  };

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-daikin-local', 'Daikin-Local', Daikin);
};
