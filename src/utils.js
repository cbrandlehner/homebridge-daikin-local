/* eslint quotes: ["error", "single", { "avoidEscape": true }] */
/* eslint quote-props: ["error", "consistent-as-needed"] */

const dns = require('node:dns');
const net = require('node:net');

const DNS_CACHE_TTL_MS = 60_000;
const dnsCache = new Map();

function parseResponse(response) {
  const vals = {};
  if (!response) {
    return vals;
  }

  for (const item of response.split(',')) {
    const separator = item.indexOf('=');
    if (separator === -1) {
      continue;
    }

    vals[item.slice(0, separator)] = item.slice(separator + 1);
  }

  return vals;
}

function daikinSpeedToRaw(daikinSpeed) {
  let raw;
  switch (daikinSpeed) {
    case 'A':
      {raw = 15;
      break;}

    case 'B':
      {raw = 5;
      break;}

    case '3':
      {raw = 25;
      break;}

    case '4':
      {raw = 35;
      break;}

    case '5':
      {raw = 50;
      break;}

    case '6':
      {raw = 70;
      break;}

    case '7':
      {raw = 100;
      break;}

    default:
      {raw = 5;}
  }

  return raw;
}

/**
 * Faikout native control JSON expects fan values A (auto), Q (night) or
 * '1'-'5' (manual levels), while the Daikin API uses A, B and '3'-'7'.
 *
 * @param {string} f_rate Daikin f_rate code.
 * @returns {string} Faikout fan value.
 */
function daikinToFaikoutFanRate(f_rate) {
  const map = {
    A: 'A', B: 'Q', 3: '1', 4: '2', 5: '3', 6: '4', 7: '5',
  };
  return map[f_rate] || 'A';
}

function parseTemperatureDisplayUnits(value, units) {
  if (value === units.FAHRENHEIT || value === 1 || value === '1' || value === 'F' || value === 'f') {
    return units.FAHRENHEIT;
  }

  return units.CELSIUS;
}

function parseThresholdField(responseValues, field) {
  const value = Number.parseFloat(responseValues[field]);
  return Number.isNaN(value) ? undefined : value;
}

/**
 * Some firmware reports auto as mode=0; mode=1 is also auto on other units.
 *
 * @param {string|undefined} mode Daikin mode code.
 * @returns {boolean}
 */
function isDaikinAutoMode(mode) {
  return mode === '0' || mode === '1';
}

/**
 * @param {string|undefined} mode Daikin mode code.
 * @param {string|undefined} pow Power state (0/1).
 * @param {object} states HomeKit CurrentHeaterCoolerState enum.
 * @returns {number}
 */
function mapDaikinModeToCurrentHeaterCoolerState(mode, pow, states) {
  if (pow !== '1') {
    return states.INACTIVE;
  }

  switch (mode) {
    case '3':
      return states.COOLING;
    case '4':
      return states.HEATING;
    case '0':
    case '1':
    case '2':
    case '6':
    default:
      return states.IDLE;
  }
}

/**
 * @param {string|undefined} mode Daikin mode code.
 * @param {string|undefined} pow Power state (0/1).
 * @param {object} states HomeKit TargetHeaterCoolerState enum.
 * @returns {number}
 */
function mapDaikinModeToTargetHeaterCoolerState(mode, pow, states) {
  if (pow !== '1') {
    return states.AUTO;
  }

  switch (mode) {
    case '3':
      return states.COOL;
    case '4':
      return states.HEAT;
    default:
      return states.AUTO;
  }
}

/**
 * Cooling threshold for HomeKit. Uses active setpoint in cool mode, stored dt7 otherwise.
 *
 * @param {object} responseValues Parsed get_control_info response.
 * @returns {number}
 */
function getCoolingThresholdFromControl(responseValues) {
  const mode = responseValues.mode;
  let coolingThresholdTemperature;

  if (mode === '3') {
    const stemp = Number.parseFloat(responseValues.stemp);
    const dt3 = Number.parseFloat(responseValues.dt3);
    if (Number.isNaN(stemp) || responseValues.stemp === 'M') {
      coolingThresholdTemperature = dt3;
    } else {
      coolingThresholdTemperature = stemp;
    }
  } else {
    coolingThresholdTemperature = parseThresholdField(responseValues, 'dt7')
      ?? parseThresholdField(responseValues, 'stemp')
      ?? 18;
  }

  if (coolingThresholdTemperature < 18) {
    coolingThresholdTemperature = 18;
  }

  return coolingThresholdTemperature;
}

/**
 * Heating threshold for HomeKit. Uses active setpoint in heat mode, stored dt5 otherwise.
 *
 * @param {object} responseValues Parsed get_control_info response.
 * @returns {number}
 */
function getHeatingThresholdFromControl(responseValues) {
  const mode = responseValues.mode;

  if (mode === '4') {
    const stemp = Number.parseFloat(responseValues.stemp);
    const dt3 = Number.parseFloat(responseValues.dt3);
    if (Number.isNaN(stemp) || responseValues.stemp === 'M') {
      return dt3;
    }

    return stemp;
  }

  return parseThresholdField(responseValues, 'dt5')
    ?? parseThresholdField(responseValues, 'stemp')
    ?? 18;
}

/**
 * Siri may invoke the cooling threshold setter while the unit is heating.
 *
 * @param {string|undefined} mode Daikin mode code.
 * @returns {boolean}
 */
function shouldRouteCoolingSetToHeating(mode) {
  return mode === '4';
}

/**
 * @param {string|undefined} mode Daikin mode code.
 * @returns {boolean}
 */
function shouldRouteHeatingSetToCooling(mode) {
  return mode === '3';
}

/**
 * @param {string} host Hostname or IP address.
 * @returns {boolean}
 */
function isIpAddress(host) {
  return net.isIP(host) !== 0;
}

/**
 * @param {string} hostname Configured controller hostname.
 * @returns {string|undefined}
 */
function getCachedDnsAddress(hostname) {
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.address;
  }

  return undefined;
}

/**
 * @param {string} hostname Configured controller hostname.
 * @param {string} address Resolved IPv4 address.
 */
function setCachedDnsAddress(hostname, address) {
  dnsCache.set(hostname, {address, expiresAt: Date.now() + DNS_CACHE_TTL_MS});
}

/** Clear the in-memory DNS cache (used by tests). */
function clearDnsCache() {
  dnsCache.clear();
}

/**
 * Resolve a configured controller host to IPv4. IP literals pass through unchanged.
 *
 * @param {string} hostname Hostname or IP from apiroute.
 * @returns {Promise<string>}
 */
async function resolveControllerHost(hostname) {
  if (isIpAddress(hostname)) {
    return hostname;
  }

  const cached = getCachedDnsAddress(hostname);
  if (cached) {
    return cached;
  }

  try {
    const {address} = await dns.promises.lookup(hostname, {family: 4});
    setCachedDnsAddress(hostname, address);
    return address;
  } catch {
    return hostname;
  }
}

/**
 * Swap the URL hostname for a resolved IP while preserving port, path, and query.
 *
 * @param {string} url Request URL.
 * @param {string} resolvedIP Resolved IPv4 address.
 * @returns {string}
 */
function replaceHostInUrl(url, resolvedIP) {
  try {
    const parsed = new URL(url);
    parsed.hostname = resolvedIP;
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * Build the Faikout WebSocket status URL from apiroute and a resolved host.
 *
 * @param {string} apiroute Configured controller origin.
 * @param {string} resolvedIP Resolved IPv4 address.
 * @returns {string}
 */
function buildWebSocketStatusUrl(apiroute, resolvedIP) {
  try {
    const parsed = new URL(apiroute);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.hostname = resolvedIP;
    parsed.pathname = '/status';
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    const protocol = apiroute.startsWith('https') ? 'wss://' : 'ws://';
    return `${protocol}${resolvedIP}/status`;
  }
}

function rawToDaikinSpeed(rawFanSpeed) {
  let f_rate = 'A';
  rawFanSpeed = Number(rawFanSpeed);
  const speedRanges = [
    {min: 1, max: 9, value: 'B'},
    {min: 9, max: 20, value: 'A'},
    {min: 20, max: 30, value: '3'},
    {min: 30, max: 40, value: '4'},
    {min: 40, max: 60, value: '5'},
    {min: 60, max: 80, value: '6'},
    {min: 80, max: 101, value: '7'},
  ];

  for (const range of speedRanges) {
    if (rawFanSpeed >= range.min && rawFanSpeed < range.max) {
      f_rate = range.value;
      break;
    }
  }

  return f_rate;
}

module.exports = {
  parseResponse,
  parseTemperatureDisplayUnits,
  daikinSpeedToRaw,
  rawToDaikinSpeed,
  daikinToFaikoutFanRate,
  isDaikinAutoMode,
  mapDaikinModeToCurrentHeaterCoolerState,
  mapDaikinModeToTargetHeaterCoolerState,
  getCoolingThresholdFromControl,
  getHeatingThresholdFromControl,
  shouldRouteCoolingSetToHeating,
  shouldRouteHeatingSetToCooling,
  isIpAddress,
  resolveControllerHost,
  replaceHostInUrl,
  buildWebSocketStatusUrl,
  clearDnsCache,
};
