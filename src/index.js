/* eslint no-unused-vars: ["warn", {"args": "none"}  ] */
/* eslint curly: "off" */
/* eslint logical-assignment-operators: ["error", "always", { enforceForIfStatements: false }] */
/* eslint quotes: ["error", "single", { "avoidEscape": true }] */
/* eslint quote-props: ["error", "consistent-as-needed"] */
/* eslint no-unused-expressions: "warn" */

let Service;
let Characteristic;
// Use node: protocol for core modules
const https = require('node:https');
const http = require('node:http');
const crypto = require('node:crypto');
const process = require('node:process');
const superagent = require('superagent');
const Throttle = require('superagent-throttle');
const WebSocket = require('ws');
const packageFile = require('../package.json');
const Cache = require('./cache.js');
const Queue = require('./queue.js');
const {parseResponse, daikinSpeedToRaw, rawToDaikinSpeed} = require('./utils.js');

/* eslint complexity: ["error", 30] */

function Daikin(log, config) {
  this.log = log;

  const NODE_MAJOR_VERSION = process.versions.node.split('.')[0];
  if (NODE_MAJOR_VERSION <= 16) {
    this.log.warn('WARNING: NodeJS version 16 and older versions are end of life as of 2023-09-11.');
    this.log.warn('Visit nodejs.org for more details.');
  }

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

    if (config.temperatureOffsetOutside === undefined) {
    this.log.warn('WARNING: your configuration is missing the parameter "temperatureOffsetOutside", using default zero');
    this.temperatureOffsetOutside = 0;
    this.log.debug('Config: temperatureOffsetOutside is %s', this.temperatureOffsetOutside);
  } else {
    this.log.debug('Config: temperatureOffsetOutside is %s', config.temperatureOffsetOutside);
    this.temperatureOffsetOutside = config.temperatureOffsetOutside;
  }

    if (config.temperatureOffsetInside === undefined) {
    this.log.warn('WARNING: your configuration is missing the parameter "temperatureOffsetInside", using default zero');
    this.temperatureOffsetInside = 0;
    this.log.debug('Config: temperatureOffsetInside is %s', this.temperatureOffsetInside);
  } else {
    this.log.debug('Config: temperatureOffsetInside is %s', config.temperatureOffsetInside);
    this.temperatureOffsetInside = config.temperatureOffsetInside;
  }

  if (config.apiroute === undefined) {
    this.log.error('ERROR: your configuration is missing the parameter "apiroute"');
    this.apiroute = 'http://127.0.0.1';
    this.apiIP = '127.0.0.1';
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

  switch (config.fanMode) {
    case 'FAN': {
      this.fanMode = '6';
      this.log.debug('Config: fanMode is %s', this.fanMode);
      break;}

    case 'DRY': {
      this.fanMode = '2';
      this.log.debug('Config: fanMode is %s', this.fanMode);
      break;}

      case undefined: {
      this.log.warn('ERROR: your configuration is missing the parameter "fanMode", using default: FAN');
      this.fanMode = '6';
      this.log.debug('Config: fanMode is %s', this.fanMode);
      break;}

      default: {
      this.log.error('ERROR: your configuration has an invalid value for parameter "fanMode", using default');
      this.fanMode = '6';
      this.log.debug('Config: fanMode is %s', this.fanMode);
      break;}
  }

    switch (config.fanPowerMode) {
      case undefined: {
        this.log.warn('ERROR: your configuration is missing the parameter "fanPowerMode", using default');
        this.fanPowerMode = false;
        break;}

        case 'FAN only': {
        this.fanPowerMode = false;
        break;}

        default: {
        this.fanPowerMode = true;
        break;}
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

  /* eslint no-implicit-coercion: "warn" */

  this.OpenSSL3 = !!config.OpenSSL3;

  this.disableFan = !!config.disableFan;

  this.enableHumiditySensor = !!config.enableHumiditySensor;

  this.enableTemperatureSensor = !!config.enableTemperatureSensor;

  this.uuid = config.uuid || '';

  // Determine if using Faikin (ESP32-Faikin) or traditional Daikin API
  this.isFaikin = (this.system === 'Faikin');

  switch (this.system) {
    case 'Default': {
      this.get_sensor_info = this.apiroute + '/aircon/get_sensor_info';
      this.get_control_info = this.apiroute + '/aircon/get_control_info';
      this.get_model_info = this.apiroute + '/aircon/get_model_info';
      this.set_control_info = this.apiroute + '/aircon/set_control_info';
      this.basic_info = this.apiroute + '/common/basic_info';
      break;}

    case 'Skyfi': {
      this.get_sensor_info = this.apiroute + '/skyfi/aircon/get_sensor_info';
      this.get_control_info = this.apiroute + '/skyfi/aircon/get_control_info';
      this.get_model_info = this.apiroute + '/skyfi/aircon/get_model_info';
      this.set_control_info = this.apiroute + '/skyfi/aircon/set_control_info';
      this.basic_info = this.apiroute + '/skyfi/common/basic_info';
      break;}

    case 'Faikin': {
      this.get_sensor_info = this.apiroute + '/aircon/get_sensor_info';
      this.get_control_info = this.apiroute + '/aircon/get_control_info';
      this.get_model_info = this.apiroute + '/aircon/get_model_info';
      this.set_control_info = this.apiroute + '/aircon/set_control_info';
      this.basic_info = this.apiroute + '/common/basic_info';
      this.faikin_control = this.apiroute + '/control'; // Faikin JSON control endpoint
      break;}

    default: {
      this.get_sensor_info = this.apiroute + '/aircon/get_sensor_info';
      this.get_control_info = this.apiroute + '/aircon/get_control_info';
      this.get_model_info = this.apiroute + '/aircon/get_model_info';
      this.set_control_info = this.apiroute + '/aircon/set_control_info';
      this.basic_info = this.apiroute + '/common/basic_info';
      break;}
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

  // Setting defaults for early response to improve HomeKit performance
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

  // description arrays
  this.modeDescription = ['off', 'Auto', 'Dehumidification', 'Cooling', 'Heating', 'unknown:5', 'Fan'];
  this.powerDescription = ['off', 'on'];

  this.FanService = new Service.Fan(this.fanName);
  this.heaterCoolerService = new Service.HeaterCooler(this.name);
  this.temperatureService = new Service.TemperatureSensor(this.name);
  this.humidityService = new Service.HumiditySensor(this.name);

  // Note: Optional characteristics are now handled via linked services
  // when disableFan=true to ensure they appear in HeaterCooler settings

  // Special modes switches - these toggle on/off
  // Note: Names stored in config for user identification
  this.econoModeName = config.econoModeName || 'Econo Mode';
  this.powerfulModeName = config.powerfulModeName || 'Powerful Mode';
  this.nightQuietModeName = config.nightQuietModeName || 'Night Quiet';

  this.econoModeService = new Service.Switch(this.econoModeName, 'econo-mode-switch');
  this.econoModeService.setCharacteristic(Characteristic.ConfiguredName, this.econoModeName);

  this.powerfulModeService = new Service.Switch(this.powerfulModeName, 'powerful-mode-switch');
  this.powerfulModeService.setCharacteristic(Characteristic.ConfiguredName, this.powerfulModeName);

  this.nightQuietModeService = new Service.Switch(this.nightQuietModeName, 'night-quiet-switch');
  this.nightQuietModeService.setCharacteristic(Characteristic.ConfiguredName, this.nightQuietModeName);

  // State for toggle modes
  this.Econo_Mode = false;
  this.Powerful_Mode = false;
  this.NightQuiet_Mode = false;

  // Config options for enabling these features
  this.enableEconoMode = !!config.enableEconoMode;
  this.enablePowerfulMode = !!config.enablePowerfulMode;
  this.enableNightQuietMode = !!config.enableNightQuietMode;

  // Config options for fan controls in settings (v1.5.1)
  this.enableFanSpeedInSettings = config.enableFanSpeedInSettings !== undefined ? config.enableFanSpeedInSettings : true;
  this.enableOscillationInSettings = config.enableOscillationInSettings !== undefined ? config.enableOscillationInSettings : true;

  // Config options for temperature ranges (v1.5.2)
  this.minTemperature = config.minTemperature !== undefined ? config.minTemperature : 18;
  this.maxTemperature = config.maxTemperature !== undefined ? config.maxTemperature : 30;

  // Config option for quiet WebSocket logging (v1.5.2)
  this.quietWebSocketLogging = config.quietWebSocketLogging !== undefined ? config.quietWebSocketLogging : true;

  // WebSocket connection for Faikin (used for econo/powerful/quiet control)
  this.faikinWs = null;
  this.faikinWsReconnectTimer = null;
  this.faikinWsHeartbeat = null;
  this.faikinWsPendingCommands = [];
}

// --- BEGIN: OpenSSL / Agent helpers (added) ---
/* eslint-disable no-bitwise */
/*
  Bitmask to (a) allow unsafe legacy renegotiation and (b) tolerate legacy servers.
  Using `|| 0` keeps this safe on builds where a constant might be missing.
*/

const SECURE_OPS
  = ((crypto.constants && crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION) || 0)
    | ((crypto.constants && crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT) || 0);
/* eslint-enable no-bitwise */

// Runtime check for OpenSSL 3 (Node 18+/20 typically link to OpenSSL 3.x)
function isOpenSSL3() {
  return (process.versions.openssl || '').startsWith('3.');
}

// Lazy singletons to avoid per-request Agent churn
let LEGACY_AGENT = null;
let DEFAULT_AGENT = null;
let DEFAULT_HTTP_AGENT = null; // { for devices with old firmware using plain http URLs }

function getLegacyAgent() {
  if (!LEGACY_AGENT) {
    LEGACY_AGENT = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: false, // device uses self-signed cert
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      secureOptions: SECURE_OPS,
      // If you see a cipher/security level error, consider:
      // ciphers: 'DEFAULT:@SECLEVEL=0',
    });
  }

  return LEGACY_AGENT;
}

function getDefaultAgent() {
  if (!DEFAULT_AGENT) {
    DEFAULT_AGENT = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: false,
    });
  }

  return DEFAULT_AGENT;
}

function getDefaultHttpAgent() { // { for devices with old firmware using plain http URLs as the code would crash trying to use https.Agent }
  if (!DEFAULT_HTTP_AGENT) {
    DEFAULT_HTTP_AGENT = new http.Agent({
      keepAlive: true,
    });
  }

  return DEFAULT_HTTP_AGENT;
}
// --- END: OpenSSL / Agent helpers ---

Daikin.prototype = {
  parseResponse,
  daikinSpeedToRaw,
  rawToDaikinSpeed,

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
          if (!(callback === undefined)) callback(response);
          done();
        }, options);
    });
  },

  _doSendGetRequest(path, callback, options) {
    // Preserve old cache behavior if present
    if (this._serveFromCache && this._serveFromCache(path, callback, options)) return;

    this.log.debug('_doSendGetRequest: requesting from API: path: %s', path);

    // Handle both throttle styles: { plugin() {..} } or a raw function(req)=>req
    const throttlePlugin = (this.throttle && typeof this.throttle.plugin === 'function')
      ? this.throttle.plugin()
      : (typeof this.throttle === 'function' ? this.throttle : r => r);

    let request = superagent
      .get(path)
      .retry(this.retries) // default retry count
      .timeout({
        response: this.response, // ms to first byte
        deadline: this.deadline, // total ms to finish
      })
      .use(throttlePlugin)
      .set('User-Agent', 'superagent')
      .set('Host', this.apiIP);

    if (this.uuid !== '') {
      request = request.set('X-Daikin-uuid', this.uuid);
    }

    // --- BEGIN: protocol-aware agent selection (changed) ---
    let urlProtocol = 'https:';
    try {
      urlProtocol = new URL(path).protocol;
    } catch {
      // fallback: if parsing fails, assume https for safety
      urlProtocol = 'https:';
    }

    if (urlProtocol === 'https:') {
      if (isOpenSSL3()) {
        // Node linked against OpenSSL 3: enable legacy reneg + lock to TLS1.2
        request = request.agent(getLegacyAgent());
      } else if (typeof request.disableTLSCerts === 'function') {
        // OpenSSL 1.1.1 path (legacy behavior)
        request = request.disableTLSCerts();
      } else {
        // Some superagent builds dropped disableTLSCerts(); use an agent fallback
        request = request.agent(getDefaultAgent());
      }
    } else {
      // http: use an http.Agent (do NOT use https.Agent for plain http URLs)
      request = request.agent(getDefaultHttpAgent());
    }
    // --- END: protocol-aware agent selection ---

    // Use end(...) to get a single error/result callback and maintain compatibility.

    request.end((error, response) => {
      if (error) {
        if (error.timeout) {/* timed out */}
        else if (error.code === 'ECONNRESET') {
          this.log.debug('_doSendGetRequest: eConnreset filtered');
        } else {
          this.log.error('_doSendGetRequest: ERROR: API request to %s returned error %s', path, error);
        }

        return callback && callback(error);
      }

      // Prefer text when available (keeps compatibility with parseResponse callers)
      const body = response && (response.text ?? (typeof response.body === 'string' ? response.body : JSON.stringify(response.body)));
      try {
        if (this.cache && typeof this.cache.set === 'function') {
          this.log.debug('_doSendGetRequest: set cache: path: %s', path);
          this.cache.set(path, body);
        }
      } catch (error) {
        this.log.debug('_doSendGetRequest: cache set failed: %s', error.message || error);
      }

      this.log.debug('_doSendGetRequest: response from API: %s', body);
      return callback && callback(null, body);
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

    if (!(callback === undefined)) callback(null, cachedResponse);
    return true;
  },

  sendFaikinControl(controlData, callback) {
    this.log.debug('sendFaikinControl: Sending control command to Faikin: %s', JSON.stringify(controlData));

    const path = this.apiroute + '/control';

    // Determine protocol for agent selection
    let urlProtocol = 'https:';
    try {
      urlProtocol = new URL(path).protocol;
    } catch {
      urlProtocol = 'https:';
    }

    let request = superagent
      .post(path)
      .send(controlData)
      .set('Content-Type', 'application/json')
      .set('User-Agent', 'superagent')
      .set('Host', this.apiIP)
      .retry(this.retries)
      .timeout({
        response: this.response,
        deadline: this.deadline,
      });

    if (this.uuid !== '') {
      request = request.set('X-Daikin-uuid', this.uuid);
    }

    // Apply appropriate agent based on protocol
    if (urlProtocol === 'https:') {
      if (isOpenSSL3()) {
        request = request.agent(getLegacyAgent());
      } else if (typeof request.disableTLSCerts === 'function') {
        request = request.disableTLSCerts();
      } else {
        request = request.agent(getDefaultAgent());
      }
    } else {
      request = request.agent(getDefaultHttpAgent());
    }

    request.end((error, response) => {
      if (error) {
        this.log.warn('sendFaikinControl: JSON control endpoint failed (%s), trying WebSocket fallback', error.message);
        // Fallback to WebSocket for Faikin S21 protocol (econo/powerful/quiet modes)
        this.sendFaikinWebSocketCommand(controlData, callback);
        return;
      }

      const body = response && (response.text ?? (typeof response.body === 'string' ? response.body : JSON.stringify(response.body)));
      this.log.debug('sendFaikinControl: response from API: %s', body);
      return callback && callback(null, body);
    });
  },

  sendFaikinControlFallback(controlData, callback) {
    this.log.info('sendFaikinControlFallback: Converting JSON to traditional Daikin API: %s', JSON.stringify(controlData));

    // Get current status first, then modify it with our changes
    this.sendGetRequest(this.get_control_info, body => {
      let query = body.replace(/,/g, '&');

      // Convert JSON control data to query string parameters
      if (controlData.power !== undefined) {
        query = query.replace(/pow=[01]/, `pow=${controlData.power ? '1' : '0'}`);
      }

      if (controlData.mode !== undefined) {
        const modeMap = {
          H: '4', C: '3', A: '1', D: '2', F: '6',
        };
        const mode = modeMap[controlData.mode] || controlData.mode;
        query = query.replace(/mode=[01234567]/, `mode=${mode}`);
      }

      if (controlData.temp !== undefined) {
        const temp = Number.parseFloat(controlData.temp).toFixed(1);
        query = query.replace(/stemp=[\d.]+/, `stemp=${temp}`);
        query = query.replace(/dt3=[\d.]+/, `dt3=${temp}`);
      }

      if (controlData.fan !== undefined) {
        query = query.replace(/f_rate=[01234567ABQ]/, `f_rate=${controlData.fan}`);
        query = query.replace(/b_f_rate=[01234567ABQ]/, `b_f_rate=${controlData.fan}`);
      }

      if (controlData.swingh !== undefined || controlData.swingv !== undefined) {
        // For traditional API, use f_dir: 0=no swing, 1=vertical, 2=horizontal, 3=both
        const swingH = controlData.swingh;
        const swingV = controlData.swingv;
        let swingMode = '0';
        if (swingH && swingV) swingMode = '3';
        else if (swingV) swingMode = '1';
        else if (swingH) swingMode = '2';
        query = query.replace(/f_dir=[0123]/, `f_dir=${swingMode}`);
        query = query.replace(/b_f_dir=[0123]/, `b_f_dir=${swingMode}`);
      }

      if (controlData.econo !== undefined) {
        // Add en_economode parameter if not present in response
        if (query.includes('en_economode=')) {
          query = query.replace(/en_economode=[01]/, `en_economode=${controlData.econo ? '1' : '0'}`);
        } else {
          query += `&en_economode=${controlData.econo ? '1' : '0'}`;
        }
      }

      if (controlData.powerful !== undefined) {
        // Add en_powerful parameter if not present in response
        if (query.includes('en_powerful=')) {
          query = query.replace(/en_powerful=[01]/, `en_powerful=${controlData.powerful ? '1' : '0'}`);
        } else {
          query += `&en_powerful=${controlData.powerful ? '1' : '0'}`;
        }
      }

      this.log.info('sendFaikinControlFallback: Using traditional API query: %s', query);
      this.sendGetRequest(this.set_control_info + '?' + query, response => {
        callback && callback(null, response);
      }, {skipCache: true, skipQueue: true});
    }, {skipCache: true});
  },

  // WebSocket connection management for Faikin
  connectFaikinWebSocket() {
    if (this.faikinWs && this.faikinWs.readyState === WebSocket.OPEN) {
      this.log.debug('connectFaikinWebSocket: Already connected');
      return;
    }

    // Clear any existing reconnect timer
    if (this.faikinWsReconnectTimer) {
      clearTimeout(this.faikinWsReconnectTimer);
      this.faikinWsReconnectTimer = null;
    }

    // Determine WebSocket URL (ws:// or wss://)
    const protocol = this.apiroute.startsWith('https') ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${this.apiIP}/status`;

    const logMethod = this.quietWebSocketLogging ? 'debug' : 'info';
    this.log[logMethod]('connectFaikinWebSocket: Connecting to %s', wsUrl);

    try {
      this.faikinWs = new WebSocket(wsUrl, {
        rejectUnauthorized: false, // Allow self-signed certificates
      });

      this.faikinWs.on('open', () => {
        this.log[logMethod]('connectFaikinWebSocket: WebSocket connected to Faikin');
        if (this.quietWebSocketLogging) {
          this.log.info('connectFaikinWebSocket: Quiet WebSocket logging enabled - status updates will use debug level');
        } else {
          this.log.info('connectFaikinWebSocket: Verbose WebSocket logging enabled - all status updates will be logged');
        }

        // Start heartbeat to receive status updates (required by Faikin)
        // Based on Faikin web UI: setInterval(function() {if(!ws)c();else ws.send('');}, 1000);
        this.faikinWsHeartbeat = setInterval(() => {
          if (this.faikinWs && this.faikinWs.readyState === 1) {
            this.faikinWs.send(''); // Send empty heartbeat message
            this.log.debug('connectFaikinWebSocket: Sent heartbeat to Faikin');
          }
        }, 1000);

        // Send any pending commands
        if (this.faikinWsPendingCommands.length > 0) {
          this.log.debug('connectFaikinWebSocket: Sending %d pending commands', this.faikinWsPendingCommands.length);
          while (this.faikinWsPendingCommands.length > 0) {
            const cmd = this.faikinWsPendingCommands.shift();
            this.sendFaikinWebSocketCommand(cmd.data, cmd.callback);
          }
        }
      });

      this.faikinWs.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Only log WebSocket messages if verbose logging is enabled
          if (!this.quietWebSocketLogging) {
            this.log.info('connectFaikinWebSocket: <<<< Received status from Faikin: %s', JSON.stringify(message));
          } else {
            this.log.debug('connectFaikinWebSocket: <<<< Received status from Faikin: %s', JSON.stringify(message));
          }
          
          // Update local state based on received status from Faikin (including rejections)
          if (message.econo !== undefined) {
            const econoState = !!message.econo;
            const oldState = this.Econo_Mode;
            
            // Only log when state actually changes
            if (oldState !== econoState) {
              if (!this.quietWebSocketLogging) {
                this.log.info('connectFaikinWebSocket: Econo mode: %s → %s', oldState, econoState);
              } else {
                this.log.debug('connectFaikinWebSocket: Econo mode: %s → %s', oldState, econoState);
              }
            }
            
            this.Econo_Mode = econoState;
            
            if (this.enableEconoMode && this.econoModeService && oldState !== econoState) {
              this.econoModeService.updateCharacteristic(Characteristic.On, this.Econo_Mode);
              
              if (!this.quietWebSocketLogging) {
                this.log.info('connectFaikinWebSocket: ✅ Updated Econo switch to: %s', this.Econo_Mode);
              } else {
                this.log.debug('connectFaikinWebSocket: ✅ Updated Econo switch to: %s', this.Econo_Mode);
              }
            }
          }

          if (message.powerful !== undefined) {
            const powerfulState = !!message.powerful;
            const oldState = this.Powerful_Mode;
            
            // Only log when state actually changes
            if (oldState !== powerfulState) {
              if (!this.quietWebSocketLogging) {
                this.log.info('connectFaikinWebSocket: Powerful mode: %s → %s', oldState, powerfulState);
              } else {
                this.log.debug('connectFaikinWebSocket: Powerful mode: %s → %s', oldState, powerfulState);
              }
            }
            
            this.Powerful_Mode = powerfulState;
            
            if (this.enablePowerfulMode && this.powerfulModeService && oldState !== powerfulState) {
              this.powerfulModeService.updateCharacteristic(Characteristic.On, this.Powerful_Mode);
              
              if (!this.quietWebSocketLogging) {
                this.log.info('connectFaikinWebSocket: ✅ Updated Powerful switch to: %s', this.Powerful_Mode);
              } else {
                this.log.debug('connectFaikinWebSocket: ✅ Updated Powerful switch to: %s', this.Powerful_Mode);
              }
            }
          }
          // Night Quiet mode is controlled by fan speed 'Q', not the 'quiet' field
          // The 'quiet' field controls outdoor unit quiet mode (different feature)

          if (message.fan !== undefined) {
            const nightQuietState = (message.fan === 'Q');
            const oldState = this.NightQuiet_Mode;
            
            // Only log when state actually changes
            if (oldState !== nightQuietState) {
              if (!this.quietWebSocketLogging) {
                this.log.info('connectFaikinWebSocket: Night Quiet mode: %s → %s (fan: %s)', oldState, nightQuietState, message.fan);
              } else {
                this.log.debug('connectFaikinWebSocket: Night Quiet mode: %s → %s (fan: %s)', oldState, nightQuietState, message.fan);
              }
            }
            
            this.NightQuiet_Mode = nightQuietState;
            
            if (this.enableNightQuietMode && this.nightQuietModeService && oldState !== nightQuietState) {
              this.nightQuietModeService.updateCharacteristic(Characteristic.On, this.NightQuiet_Mode);
              
              if (!this.quietWebSocketLogging) {
                this.log.info('connectFaikinWebSocket: ✅ Updated Night Quiet switch to: %s', this.NightQuiet_Mode);
              } else {
                this.log.debug('connectFaikinWebSocket: ✅ Updated Night Quiet switch to: %s', this.NightQuiet_Mode);
              }
            }
          }
        } catch (error) {
          this.log.warn('connectFaikinWebSocket: Error parsing message: %s', error.message);
          this.log.warn('connectFaikinWebSocket: Raw data was: %s', data.toString());
        }
      });

      this.faikinWs.on('error', (error) => {
        this.log.warn('connectFaikinWebSocket: WebSocket error: %s', error.message);
      });

      this.faikinWs.on('close', () => {
        const logMethod = this.quietWebSocketLogging ? 'debug' : 'info';
        this.log[logMethod]('connectFaikinWebSocket: WebSocket closed, will reconnect in 5 seconds');
        
        // Clear heartbeat timer
        if (this.faikinWsHeartbeat) {
          clearInterval(this.faikinWsHeartbeat);
          this.faikinWsHeartbeat = null;
        }
        
        this.faikinWs = null;
        
        // Reconnect after 5 seconds
        this.faikinWsReconnectTimer = setTimeout(() => {
          this.connectFaikinWebSocket();
        }, 5000);
      });
    } catch (error) {
      this.log.error('connectFaikinWebSocket: Failed to create WebSocket: %s', error.message);
      
      // Retry connection after 10 seconds
      this.faikinWsReconnectTimer = setTimeout(() => {
        this.connectFaikinWebSocket();
      }, 10_000);
    }
  },

  sendFaikinWebSocketCommand(controlData, callback) {
    if (!this.faikinWs || this.faikinWs.readyState !== WebSocket.OPEN) {
      this.log.debug('sendFaikinWebSocketCommand: WebSocket not connected, queuing command');
      this.faikinWsPendingCommands.push({data: controlData, callback});
      this.connectFaikinWebSocket();
      return;
    }

    const message = JSON.stringify(controlData);
    const logMethod = this.quietWebSocketLogging ? 'debug' : 'info';
    this.log[logMethod]('sendFaikinWebSocketCommand: >>>> Sending to Faikin: %s', message);
    
    try {
      this.faikinWs.send(message, (error) => {
        if (error) {
          this.log.error('sendFaikinWebSocketCommand: Error sending command: %s', error.message);
          if (callback) callback(error);
        } else {
          this.log[logMethod]('sendFaikinWebSocketCommand: Command sent successfully, waiting for Faikin response...');
          if (callback) callback(null);
        }
      });
    } catch (error) {
      this.log.error('sendFaikinWebSocketCommand: Exception sending command: %s', error.message);
      if (callback) callback(error);
    }
  },

  closeFaikinWebSocket() {
    if (this.faikinWsReconnectTimer) {
      clearTimeout(this.faikinWsReconnectTimer);
      this.faikinWsReconnectTimer = null;
    }
    
    if (this.faikinWsHeartbeat) {
      clearInterval(this.faikinWsHeartbeat);
      this.faikinWsHeartbeat = null;
    }
    
    if (this.faikinWs) {
      const logMethod = this.quietWebSocketLogging ? 'debug' : 'info';
      this.log[logMethod]('closeFaikinWebSocket: Closing WebSocket connection');
      this.faikinWs.close();
      this.faikinWs = null;
    }
  },

  getActive(callback) {
        this.sendGetRequest(this.get_control_info, body => {
          const responseValues = this.parseResponse(body);
          this.log.debug('getActive: Power is: %s, Mode is %s', responseValues.pow, responseValues.mode);
          let HomeKitState = '0';
          if (responseValues.mode === '6' || responseValues.mode === '2' || responseValues.mode === '1') // If AC is in Fan-mode, or in Humidity-mode then show AC OFF in HomeKit
            HomeKitState = '0';
          else
            if (responseValues.pow === '1')
              HomeKitState = '1'; // Power is ON and the device is neither in Fan-mode nor Humidity-mode
            else
              HomeKitState = '0'; // Power is OFF
          if (!(callback === undefined)) callback(null, HomeKitState === '1' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
        });
    },
  getActiveFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getActiveFV: early callback with cached Active: %s (%d).', this.HeaterCooler_Active, counter);
    if (!(callback === undefined)) callback(null, this.HeaterCooler_Active);
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
            case '1': { // Auto
            this.log.warn('Auto');
              query = query
                .replace(/mode=[01234567]/, `mode=${this.defaultMode}`)
                .replace(/stemp=--/, `stemp=${responseValues.dt7}`)
                .replace(/dt3=--/, `dt3=${responseValues.dt7}`)
                .replace(/shum=--/, `shum=${'0'}`);
                break;}

            case '3': { // COOL
              query = query
                .replace(/mode=[01234567]/, `mode=${this.defaultMode}`)
                .replace(/stemp=--/, `stemp=${responseValues.dt7}`)
                .replace(/dt3=--/, `dt3=${responseValues.dt7}`)
                .replace(/shum=--/, `shum=${'0'}`);
                break;}

                case '4': { // HEAT
                  query = query
                    .replace(/mode=[01234567]/, `mode=${this.defaultMode}`)
                    .replace(/stemp=--/, `stemp=${responseValues.dt5}`)
                    .replace(/dt3=--/, `dt3=${responseValues.dt5}`)
                    .replace(/shum=--/, `shum=${'0'}`);
                    break;}

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
          if (!(callback === undefined)) callback();
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
      
      if (this.isFaikin) {
        // Faikin uses separate swingh and swingv booleans
        const swingH = responseValues.swingh === '1' || responseValues.swingh === 'true' || responseValues.swingh === true;
        const swingV = responseValues.swingv === '1' || responseValues.swingv === 'true' || responseValues.swingv === true;
        this.log.debug('getSwingMode (Faikin): swingh=%s, swingv=%s', swingH, swingV);
        // Enable HomeKit swing if either horizontal or vertical swing is on
        const isEnabled = swingH || swingV;
        callback(null, isEnabled ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);
      } else {
        // Traditional Daikin f_dir values:
        // 0 - No swing
        // 1 - Vertical swing
        // 2 - Horizontal swing
        // 3 - 3D swing
        this.log.debug('getSwingMode: swing mode is: %s. 0=No swing, 1=Vertical swing, 2=Horizontal swing, 3=3D swing.', responseValues.f_dir);
        this.log.debug('getSwingMode: swing mode for HomeKit is: %s. 0=Disabled, 1=Enabled', responseValues.f_dir === '0' ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);
        callback(null, responseValues.f_dir === '0' ? Characteristic.SwingMode.SWING_DISABLED : Characteristic.SwingMode.SWING_ENABLED);
      }
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
    if (this.isFaikin) {
      // Faikin uses separate swingh and swingv booleans
      // When enabling swing, enable both horizontal and vertical (3D swing)
      // When disabling, disable both
      const enableSwing = (swing !== Characteristic.SwingMode.SWING_DISABLED);
      const controlData = {
        swingh: enableSwing,
        swingv: enableSwing,
      };
      this.log.info(
        'setSwingMode (Faikin): HomeKit requested swing mode: %s (swingh=%s, swingv=%s)',
        swing,
        enableSwing,
        enableSwing,
      );
      this.HeaterCooler_SwingMode = swing;
      this.log.debug('setSwingMode: update SwingMode: %s.', this.HeaterCooler_SwingMode);
      
      this.sendFaikinControl(controlData, () => {
        this.HeaterCooler_SwingMode = swing;
        this.log.debug('setSwingMode: confirmed SwingMode: %s.', this.HeaterCooler_SwingMode);
        callback();
      });
    } else {
      // Traditional Daikin API
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
    }
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
                      case '6': { // FAN-Mode
                          status = Characteristic.CurrentHeaterCoolerState.IDLE;
                          break;}

                          case '3': {
                          status = Characteristic.CurrentHeaterCoolerState.COOLING;
                          break;}

                          case '4': {
                          status = Characteristic.CurrentHeaterCoolerState.HEATING;
                          break;}

                          default: {
                          status = Characteristic.CurrentHeaterCoolerState.IDLE;
                          }
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
                        case '0': { // automatic
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;}

                        case '1': { // humidification
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;}

                        case '2': { // dehumidification
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;}

                        case '3': { // cool
                            status = Characteristic.TargetHeaterCoolerState.COOL;
                            break;}

                        case '4': { // heat
                            status = Characteristic.TargetHeaterCoolerState.HEAT;
                            break;}

                        case '6': { // AUTO or FAN
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;}

                        default: {
                            status = Characteristic.TargetHeaterCoolerState.AUTO;
                        }
                    }
                }

                this.log.debug('getTargetHeaterCoolerState is %s', status);
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
                      case Characteristic.TargetHeaterCoolerState.AUTO: {
                          this.log.info('HomeKit requested the AC to operate in AUTO mode.');
                          mode = 0;
                          break;}

                      case Characteristic.TargetHeaterCoolerState.COOL: {
                          this.log.info('HomeKit requested the AC to operate in COOL mode.');
                          mode = 3;
                          break;}

                      case Characteristic.TargetHeaterCoolerState.HEAT: {
                          this.log.info('HomeKit requested the AC to operate in HEAT mode.');
                          mode = 4;
                          break;}

                      default: {
                          break;
                      }
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
      const rawTemperature = Number.parseFloat(responseValues.htemp);
      const adjustedTemperature = rawTemperature + this.temperatureOffsetInside;
      this.log.debug(
        'Temperature (raw): %s°, offset: %s°, adjusted: %s°',
        rawTemperature.toFixed(1),
        this.temperatureOffsetInside.toFixed(1),
        adjustedTemperature.toFixed(1)
        );
      callback(null, adjustedTemperature);
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
                    const currentHumidity = (value => Number.isNaN(value) ? 0 : value)(Number.parseFloat(responseValues.hhum));
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
      const rawTemperature = Number.parseFloat(responseValues.otemp);
      const adjustedTemperature = rawTemperature + this.temperatureOffsetOutside;
      this.log.debug(
        'Temperature (raw): %s°, offset: %s°, adjusted: %s°',
        rawTemperature.toFixed(1),
        this.temperatureOffsetOutside.toFixed(1),
        adjustedTemperature.toFixed(1)
        );
      callback(null, adjustedTemperature);
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
                  if (coolingThresholdTemperature < 18) coolingThresholdTemperature = 18; // to fix #264
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

  getEconoMode: function (callback) {
    if (this.isFaikin) {
      // Faikin uses JSON control API
      this.sendGetRequest(this.get_control_info, body => {
        const responseValues = this.parseResponse(body);
        this.log.debug('getEconoMode (Faikin): econo is: %s', responseValues.econo);
        const isEnabled = responseValues.econo === '1' || responseValues.econo === 'true' || responseValues.econo === true;
        callback(null, isEnabled);
      });
    } else {
      // Traditional Daikin API
      this.sendGetRequest(this.get_control_info, body => {
        const responseValues = this.parseResponse(body);
        this.log.debug('getEconoMode: en_economode is: %s', responseValues.en_economode);
        const isEnabled = responseValues.en_economode === '1';
        callback(null, isEnabled);
      });
    }
  },

  getEconoModeFV: function (callback) {
    const counter = ++this.counter;
    this.log.debug('getEconoModeFV: early callback with cached EconoMode: %s (%d).', this.Econo_Mode, counter);
    callback(null, this.Econo_Mode);
    this.getEconoMode((error, state) => {
      this.Econo_Mode = state;
      this.econoModeService.getCharacteristic(Characteristic.On).updateValue(this.Econo_Mode);
      this.log.debug('getEconoModeFV: update EconoMode: %s (%d).', this.Econo_Mode, counter);
    });
  },

  setEconoMode: function (value, callback) {
    this.log.info('setEconoMode: HomeKit requested to turn Econo mode %s.', value ? 'ON' : 'OFF');
    
    // Econo, Powerful, and Night Quiet modes are mutually exclusive
    if (value) {
      if (this.Powerful_Mode) {
        this.log.info('setEconoMode: Turning off Powerful mode (mutually exclusive)');
        this.Powerful_Mode = false;
        if (this.enablePowerfulMode) {
          this.powerfulModeService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      }

      if (this.NightQuiet_Mode) {
        this.log.info('setEconoMode: Turning off Night Quiet mode (mutually exclusive)');
        this.NightQuiet_Mode = false;
        if (this.enableNightQuietMode) {
          this.nightQuietModeService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      }
    }
    
    if (this.isFaikin) {
      // Faikin uses JSON control API - send POST to /control endpoint
      const controlData = {
        econo: value,
      };
      // If turning on Econo, also disable Powerful and reset fan from 'Q'
      if (value) {
        controlData.powerful = false;
        controlData.fan = 'A'; // Reset fan to Auto if it was in Quiet mode
      }

      this.log.info('setEconoMode (Faikin): Sending control data: %s', JSON.stringify(controlData));
      this.Econo_Mode = value;
      this.log.debug('setEconoMode: update EconoMode: %s.', this.Econo_Mode);
      
      // For Faikin, we need to send a POST request with JSON payload
      this.sendFaikinControl(controlData, () => {
        this.Econo_Mode = value;
        this.log.debug('setEconoMode: confirmed EconoMode: %s.', this.Econo_Mode);
        if (callback) callback();
      });
    } else {
      // Traditional Daikin API
      this.sendGetRequest(this.get_control_info, body => {
        const targetValue = value ? '1' : '0';
        let query = body.replace(/,/g, '&').replace(/en_economode=[01]/, `en_economode=${targetValue}`);
        // If turning on Econo, also disable Powerful
        if (value) {
          query = query.replace(/en_powerful=[01]/, 'en_powerful=0');
        }

        this.log.debug('setEconoMode: Query is: %s', query);
        this.Econo_Mode = value;
        this.log.debug('setEconoMode: update EconoMode: %s.', this.Econo_Mode);
        this.sendGetRequest(this.set_control_info + '?' + query, _response => {
          this.Econo_Mode = value;
          this.log.debug('setEconoMode: confirmed EconoMode: %s.', this.Econo_Mode);
          if (callback) callback();
        }, {skipCache: true, skipQueue: true});
      }, {skipCache: true});
    }
  },

  getPowerfulMode: function (callback) {
    if (this.isFaikin) {
      // Faikin uses JSON control API
      this.sendGetRequest(this.get_control_info, body => {
        const responseValues = this.parseResponse(body);
        this.log.debug('getPowerfulMode (Faikin): powerful is: %s', responseValues.powerful);
        const isEnabled = responseValues.powerful === '1' || responseValues.powerful === 'true' || responseValues.powerful === true;
        callback(null, isEnabled);
      });
    } else {
      // Traditional Daikin API
      this.sendGetRequest(this.get_control_info, body => {
        const responseValues = this.parseResponse(body);
        this.log.debug('getPowerfulMode: en_powerful is: %s', responseValues.en_powerful);
        const isEnabled = responseValues.en_powerful === '1';
        callback(null, isEnabled);
      });
    }
  },

  getPowerfulModeFV: function (callback) {
    const counter = ++this.counter;
    this.log.debug('getPowerfulModeFV: early callback with cached PowerfulMode: %s (%d).', this.Powerful_Mode, counter);
    callback(null, this.Powerful_Mode);
    this.getPowerfulMode((error, state) => {
      this.Powerful_Mode = state;
      this.powerfulModeService.getCharacteristic(Characteristic.On).updateValue(this.Powerful_Mode);
      this.log.debug('getPowerfulModeFV: update PowerfulMode: %s (%d).', this.Powerful_Mode, counter);
    });
  },

  setPowerfulMode: function (value, callback) {
    this.log.info('setPowerfulMode: HomeKit requested to turn Powerful mode %s.', value ? 'ON' : 'OFF');
    
    // Econo, Powerful, and Night Quiet modes are mutually exclusive
    if (value) {
      if (this.Econo_Mode) {
        this.log.info('setPowerfulMode: Turning off Econo mode (mutually exclusive)');
        this.Econo_Mode = false;
        if (this.enableEconoMode) {
          this.econoModeService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      }

      if (this.NightQuiet_Mode) {
        this.log.info('setPowerfulMode: Turning off Night Quiet mode (mutually exclusive)');
        this.NightQuiet_Mode = false;
        if (this.enableNightQuietMode) {
          this.nightQuietModeService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      }
    }
    
    if (this.isFaikin) {
      // Faikin uses JSON control API - send POST to /control endpoint
      const controlData = {
        powerful: value,
      };
      // If turning on Powerful, also disable Econo and reset fan from 'Q'
      if (value) {
        controlData.econo = false;
        controlData.fan = 'A'; // Reset fan to Auto if it was in Quiet mode
      }

      this.log.info('setPowerfulMode (Faikin): Sending control data: %s', JSON.stringify(controlData));
      this.Powerful_Mode = value;
      this.log.debug('setPowerfulMode: update PowerfulMode: %s.', this.Powerful_Mode);
      
      this.sendFaikinControl(controlData, () => {
        this.Powerful_Mode = value;
        this.log.debug('setPowerfulMode: confirmed PowerfulMode: %s.', this.Powerful_Mode);
        if (callback) callback();
      });
    } else {
      // Traditional Daikin API
      this.sendGetRequest(this.get_control_info, body => {
        const targetValue = value ? '1' : '0';
        let query = body.replace(/,/g, '&').replace(/en_powerful=[01]/, `en_powerful=${targetValue}`);
        // If turning on Powerful, also disable Econo
        if (value) {
          query = query.replace(/en_economode=[01]/, 'en_economode=0');
        }

        this.log.debug('setPowerfulMode: Query is: %s', query);
        this.Powerful_Mode = value;
        this.log.debug('setPowerfulMode: update PowerfulMode: %s.', this.Powerful_Mode);
        this.sendGetRequest(this.set_control_info + '?' + query, _response => {
          this.Powerful_Mode = value;
          this.log.debug('setPowerfulMode: confirmed PowerfulMode: %s.', this.Powerful_Mode);
          if (callback) callback();
        }, {skipCache: true, skipQueue: true});
      }, {skipCache: true});
    }
  },

  getNightQuietMode: function (callback) {
    if (this.isFaikin) {
      // Faikin uses fan='Q' for night/quiet mode
      this.sendGetRequest(this.get_control_info, body => {
        const responseValues = this.parseResponse(body);
        this.log.debug('getNightQuietMode (Faikin): fan is: %s', responseValues.fan);
        // Check if fan is set to 'Q' (Night/Quiet mode)
        const isEnabled = responseValues.fan === 'Q';
        callback(null, isEnabled);
      });
    } else {
      // Traditional Daikin API: Night quiet is typically fan rate 'B' (silent mode)
      // Some models may use f_rate='B', others may have a dedicated parameter
      this.sendGetRequest(this.get_control_info, body => {
        const responseValues = this.parseResponse(body);
        this.log.debug('getNightQuietMode: f_rate is: %s', responseValues.f_rate);
        // 'B' or 'A' typically represents silent/night mode on Daikin controllers
        const isEnabled = responseValues.f_rate === 'B';
        callback(null, isEnabled);
      });
    }
  },

  getNightQuietModeFV: function (callback) {
    const counter = ++this.counter;
    this.log.debug('getNightQuietModeFV: early callback with cached NightQuietMode: %s (%d).', this.NightQuiet_Mode, counter);
    callback(null, this.NightQuiet_Mode);
    this.getNightQuietMode((error, state) => {
      this.NightQuiet_Mode = state;
      this.nightQuietModeService.getCharacteristic(Characteristic.On).updateValue(this.NightQuiet_Mode);
      this.log.debug('getNightQuietModeFV: update NightQuietMode: %s (%d).', this.NightQuiet_Mode, counter);
    });
  },

  setNightQuietMode: function (value, callback) {
    this.log.info('setNightQuietMode: HomeKit requested to turn Night Quiet mode %s.', value ? 'ON' : 'OFF');
    
    // Econo, Powerful, and Night Quiet modes are mutually exclusive
    if (value) {
      if (this.Econo_Mode) {
        this.log.info('setNightQuietMode: Turning off Econo mode (mutually exclusive)');
        this.Econo_Mode = false;
        if (this.enableEconoMode) {
          this.econoModeService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      }

      if (this.Powerful_Mode) {
        this.log.info('setNightQuietMode: Turning off Powerful mode (mutually exclusive)');
        this.Powerful_Mode = false;
        if (this.enablePowerfulMode) {
          this.powerfulModeService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      }
    }
    
    if (this.isFaikin) {
      // Faikin uses fan='Q' for night/quiet mode, 'A' for auto
      // According to Faikin API docs: fan can be 'A' (Auto), 'Q' (Night), or '1'-'5' for manual levels
      const controlData = {
        fan: value ? 'Q' : 'A',
      };
      // If turning on Night Quiet, also disable Econo and Powerful
      if (value) {
        controlData.econo = false;
        controlData.powerful = false;
      }

      this.log.info('setNightQuietMode (Faikin): Sending control data: %s', JSON.stringify(controlData));
      this.NightQuiet_Mode = value;
      this.log.debug('setNightQuietMode: update NightQuietMode: %s.', this.NightQuiet_Mode);
      
      this.sendFaikinControl(controlData, () => {
        this.NightQuiet_Mode = value;
        this.log.debug('setNightQuietMode: confirmed NightQuietMode: %s.', this.NightQuiet_Mode);
        if (callback) callback();
      });
    } else {
      // Traditional Daikin API: Set fan rate to 'B' (silent) for night quiet mode
      // When turning off, restore to 'A' (auto) or previous fan speed
      this.sendGetRequest(this.get_control_info, body => {
        const targetFanRate = value ? 'B' : 'A'; // 'B' is typically silent mode, 'A' is auto
        let query = body.replace(/,/g, '&').replace(/f_rate=[01234567AB]/, `f_rate=${targetFanRate}`);
        query = query.replace(/,/g, '&').replace(/b_f_rate=[01234567AB]/, `b_f_rate=${targetFanRate}`);
        this.log.debug('setNightQuietMode: Setting fan rate to %s. Query is: %s', targetFanRate, query);
        this.NightQuiet_Mode = value;
        this.log.debug('setNightQuietMode: update NightQuietMode: %s.', this.NightQuiet_Mode);
        this.sendGetRequest(this.set_control_info + '?' + query, _response => {
          this.NightQuiet_Mode = value;
          this.log.debug('setNightQuietMode: confirmed NightQuietMode: %s.', this.NightQuiet_Mode);
          if (callback) callback();
        }, {skipCache: true, skipQueue: true});
      }, {skipCache: true});
    }
  },

  getFanStatus: function (callback) {
    this.sendGetRequest(this.basic_info, body => {
      const responseValues = this.parseResponse(body);
      callback(null, responseValues.pow === '1');
    });
  },
  getFanStatusFV(callback) { // FV 210510: Wrapper for service call to early return
    const counter = ++this.counter;
    this.log.debug('getFanStatusFV: early callback with cached Status: %s (counter: %d).', this.powerDescription[this.Fan_Status], counter);
    callback(null, this.Fan_Status);
    this.getFanStatus((error, HomeKitState) => {
      this.Fan_Status = HomeKitState;
      this.FanService.getCharacteristic(Characteristic.On).updateValue(this.Fan_Status); // FV210504
      this.log.debug('getFanStatusFV: update Status: %s (counter: %d).', this.Fan_Status ? 'on' : 'off', counter);
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
      this.log.info('setFanStatus: HomeKit requested to turn the FAN %s.', this.powerDescription[targetPOW]);
      this.log.debug('setFanStatus: Current Power is: %s.', this.powerDescription[currentPOW]);
      this.log.debug('setFanStatus: Current Mode is: %s.', this.modeDescription[responseValues.mode]);

      if (targetPOW === currentPOW) {
        this.log.debug('setFanStatus: Powerstate did not change, ignore it.');
        if (!(callback === undefined)) callback();
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

       if (!(callback === undefined)) callback();
       return;
     }
     // turn power on

     if (this.fanPowerMode === true) {
       this.log.debug('setFanStatus: fanPowerMode is "complete Device" => power on Device.');
       this.setActive(1);
       if (!(callback === undefined)) callback();
       return;
     }

     this.log.info('setFanStatus: fanPowerMode is "FAN only", power on Device in configured FAN mode.');

     const query = `pow=${targetPOW}&mode=${targetFanMode}&stemp=${responseValues.stemp}&shum=${responseValues.shum}&dt2=${responseValues.dt2}&dh2=${responseValues.dh2}&f_rate=${responseValues.f_rate}&f_dir=${this.swingMode}`;
     this.log.debug('setFanStatus: going to send this query: %s', query);
     this.Fan_Status = targetPOW; // FV2105010
     this.log.debug('setFanStatus: update Status: %s.', this.powerDescription[this.Fan_Status]); // FV2105010
     this.sendGetRequest(this.set_control_info + '?' + query, _response => {
        if (!(callback === undefined)) callback();
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
        if (!(callback === undefined)) callback();
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
			.setCharacteristic(Characteristic.SerialNumber, this.name);

		// Initialize services array early so it can be used throughout the function
		const services = [informationService, this.heaterCoolerService];

		this.FanService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getFanStatusFV.bind(this))
			.on('set', this.setFanStatus.bind(this));

		this.FanService
			.getCharacteristic(Characteristic.RotationSpeed)
			.on('get', this.getFanSpeedFV.bind(this))
			.on('set', this.setFanSpeed.bind(this));

		// Add SwingMode to Fan service for easier access in HomeKit
		this.FanService
			.getCharacteristic(Characteristic.SwingMode)
			.on('get', this.getSwingModeFV.bind(this))
			.on('set', this.setSwingMode.bind(this));

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
      .setProps({
        minValue: this.minTemperature,
        maxValue: this.maxTemperature,
        minStep: Number.parseFloat('0.5'),
      })
      .on('get', this.getCoolingTemperatureFV.bind(this))
      .on('set', this.setCoolingTemperature.bind(this));

    this.heaterCoolerService
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: this.minTemperature,
        maxValue: this.maxTemperature,
        minStep: Number.parseFloat('0.5'),
      })
      .on('get', this.getHeatingTemperatureFV.bind(this))
      .on('set', this.setHeatingTemperature.bind(this));

    // Conditionally add fan controls based on configuration:
    //
    // When disableFan = true:
    //   - No separate fan accessory in main view
    //   - Fan controls appear directly in HeaterCooler settings via linked service
    //
    // When disableFan = false:
    //   - Separate fan accessory visible in main view
    //   - Optionally also add controls to HeaterCooler settings if enabled

    if (this.disableFan) {
        // Fan accessory disabled - create linked fan service for HeaterCooler settings
        this.log.info('Fan accessory disabled. Creating linked fan service for HeaterCooler settings.');

        // Create a linked fan service that will appear in HeaterCooler settings
        this.linkedFanService = new Service.Fan(this.fanName + ' Controls', 'linked-fan-service');

        // Configure the linked fan service
        this.linkedFanService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getFanStatusFV.bind(this))
            .on('set', this.setFanStatus.bind(this));

        if (this.enableFanSpeedInSettings) {
            this.log.info('Adding RotationSpeed to linked fan service.');
            this.linkedFanService
                .getCharacteristic(Characteristic.RotationSpeed)
                .on('get', this.getFanSpeedFV.bind(this))
                .on('set', this.setFanSpeed.bind(this));
        }

        if (this.enableOscillationInSettings) {
            this.log.info('Adding SwingMode to linked fan service.');
            this.linkedFanService
                .getCharacteristic(Characteristic.SwingMode)
                .on('get', this.getSwingModeFV.bind(this))
                .on('set', this.setSwingMode.bind(this));
        }

        // Link the fan service to the HeaterCooler service
        this.heaterCoolerService.addLinkedService(this.linkedFanService);

        // Add the linked service to the services array so it's available
        services.push(this.linkedFanService);

    } else {
        // Fan accessory enabled - it will appear in main view
        // Add the regular fan service to services array
        this.log.info('Fan accessory enabled. Fan will appear in main view.');
        services.push(this.FanService);

        // Optionally also add controls to HeaterCooler settings
        if (this.enableOscillationInSettings) {
            this.log.info('Adding SwingMode (Oscillation) to HeaterCooler settings.');
            this.heaterCoolerService.getCharacteristic(Characteristic.SwingMode)
                .on('get', this.getSwingModeFV.bind(this))
                .on('set', this.setSwingMode.bind(this));
        }

        if (this.enableFanSpeedInSettings) {
            this.log.info('Adding RotationSpeed (Fan Speed) to HeaterCooler settings.');
            this.heaterCoolerService.getCharacteristic(Characteristic.RotationSpeed)
                .on('get', this.getFanSpeedFV.bind(this))
                .on('set', this.setFanSpeed.bind(this));
        }
    }

    this.heaterCoolerService
    .getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .on('get', this.getTemperatureDisplayUnits.bind(this))
    .on('set', this.setTemperatureDisplayUnits.bind(this));

    if (this.enableTemperatureSensor) {
        this.temperatureService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                minValue: Number.parseFloat('-50'),
                maxValue: Number.parseFloat('100'),
            })
            .on('get', this.getCurrentTemperatureFV.bind(this));
        services.push(this.temperatureService);
    }

    if (this.enableHumiditySensor) {
        this.humidityService
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .setProps({
                minValue: Number.parseFloat('0'),
                maxValue: Number.parseFloat('100'),
            })
            .on('get', this.getCurrentHumidityFV.bind(this));
        services.push(this.humidityService);
    }

    if (this.enableEconoMode) {
        this.econoModeService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getEconoModeFV.bind(this))
            .on('set', this.setEconoMode.bind(this));
        
        // Set ConfiguredName to allow HomeKit to rename the switch and persist it
        this.econoModeService
            .getCharacteristic(Characteristic.ConfiguredName)
            .on('set', (value, callback) => {
                this.log.info('Econo Mode switch renamed to: "%s"', value);
                callback();
            });
        
        services.push(this.econoModeService);
        
        this.log.info('===== ECONO MODE SWITCH ENABLED =====');
        this.log.info('Switch name configured as: "%s"', this.econoModeName);
        this.log.info('Toggle this switch ON and check the logs to identify it');
        this.log.info('You can rename this switch in the Home app');
        this.log.info('=====================================');
    }

    if (this.enablePowerfulMode) {
        this.powerfulModeService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getPowerfulModeFV.bind(this))
            .on('set', this.setPowerfulMode.bind(this));
        
        // Set ConfiguredName to allow HomeKit to rename the switch and persist it
        this.powerfulModeService
            .getCharacteristic(Characteristic.ConfiguredName)
            .on('set', (value, callback) => {
                this.log.info('Powerful Mode switch renamed to: "%s"', value);
                callback();
            });
        
        services.push(this.powerfulModeService);
        
        this.log.info('===== POWERFUL MODE SWITCH ENABLED =====');
        this.log.info('Switch name configured as: "%s"', this.powerfulModeName);
        this.log.info('Toggle this switch ON and check the logs to identify it');
        this.log.info('You can rename this switch in the Home app');
        this.log.info('========================================');
    }

    if (this.enableNightQuietMode) {
        this.nightQuietModeService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getNightQuietModeFV.bind(this))
            .on('set', this.setNightQuietMode.bind(this));
        
        // Set ConfiguredName to allow HomeKit to rename the switch and persist it
        this.nightQuietModeService
            .getCharacteristic(Characteristic.ConfiguredName)
            .on('set', (value, callback) => {
                this.log.info('Night Quiet Mode switch renamed to: "%s"', value);
                callback();
            });
        
        services.push(this.nightQuietModeService);
        
        this.log.info('===== NIGHT QUIET SWITCH ENABLED =====');
        this.log.info('Switch name configured as: "%s"', this.nightQuietModeName);
        this.log.info('Toggle this switch ON and check the logs to identify it');
        this.log.info('You can rename this switch in the Home app');
        this.log.info('======================================');
    }

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
