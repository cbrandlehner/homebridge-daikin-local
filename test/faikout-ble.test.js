'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDaikin,
  readCurrentTemperature,
  readCoolingTemperature,
  writeCoolingTemperature,
} = require('./helpers/mock-homebridge.js');

function createFaikout(config = {}) {
  const daikin = createDaikin({system: 'Faikout', ...config});
  daikin.connectFaikoutWebSocket = () => {};
  return daikin;
}

function promisify(fn) {
  return new Promise((resolve, reject) => {
    fn((error, value) => (error ? reject(error) : resolve(value)));
  });
}

const status = {
  home: 23.5,
  temp: 29,
  ble: {temp: 20.53, hum: 49.6, bat: 100},
  autoe: true,
  autor: 0.5,
  autot: 21,
};

test('options are ignored for non-Faikout systems', () => {
  const daikin = createDaikin({faikoutUseBleSensor: true, faikoutUseAutoTarget: true});

  assert.equal(daikin.faikoutUseBleSensor, false);
  assert.equal(daikin.faikoutUseAutoTarget, false);
});

test('WebSocket status messages are kept for later reads', () => {
  const daikin = createFaikout();

  daikin._updateFaikoutStatus({home: 23.5, ble: {temp: 20.5}}, 'debug');
  daikin._updateFaikoutStatus({autot: 21}, 'debug');

  assert.equal(daikin.faikoutStatus.home, 23.5);
  assert.equal(daikin.faikoutStatus.autot, 21);
  assert.deepEqual(daikin.faikoutStatus.ble, {temp: 20.5});
});

test('getCurrentTemperature uses the Faikout BLE sensor when enabled', async () => {
  const daikin = createFaikout({faikoutUseBleSensor: true});
  daikin.sendGetRequest = () => assert.fail('AC sensor should not be read');
  daikin._updateFaikoutStatus(status, 'debug');

  assert.equal(await readCurrentTemperature(daikin), 20.5);
});

test('getCurrentTemperature falls back to the AC sensor without a BLE reading', async () => {
  const daikin = createFaikout({faikoutUseBleSensor: true, temperatureOffsetInside: 0});
  daikin.sendGetRequest = (_path, callback) => callback('ret=OK,htemp=23.0,otemp=7.0');
  daikin._updateFaikoutStatus({home: 23}, 'debug');

  assert.equal(await readCurrentTemperature(daikin), 23);
});

test('getCurrentTemperature falls back when the Faikout status is stale', async () => {
  const daikin = createFaikout({faikoutUseBleSensor: true, temperatureOffsetInside: 0});
  let reconnects = 0;
  daikin.connectFaikoutWebSocket = () => {
    reconnects++;
  };

  daikin.sendGetRequest = (_path, callback) => callback('ret=OK,htemp=23.0,otemp=7.0');
  daikin._updateFaikoutStatus(status, 'debug');
  daikin.faikoutStatusTime = Date.now() - (5 * 60 * 1000);

  assert.equal(await readCurrentTemperature(daikin), 23);
  assert.equal(reconnects, 1);
});

test('BLE sensor is not used unless the option is enabled', async () => {
  const daikin = createFaikout({temperatureOffsetInside: 0});
  daikin.sendGetRequest = (_path, callback) => callback('ret=OK,htemp=23.0,otemp=7.0');
  daikin._updateFaikoutStatus(status, 'debug');

  assert.equal(await readCurrentTemperature(daikin), 23);
});

test('getCurrentHumidity uses the Faikout BLE sensor when enabled', async () => {
  const daikin = createFaikout({faikoutUseBleSensor: true});
  daikin.sendGetRequest = () => assert.fail('AC sensor should not be read');
  daikin._updateFaikoutStatus(status, 'debug');

  assert.equal(await promisify(callback => daikin.getCurrentHumidity(callback)), 50);
});

test('target temperature reads the Faikout auto target while Faikout auto is active', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin.sendGetRequest = () => assert.fail('AC setpoint should not be read');
  daikin._updateFaikoutStatus(status, 'debug');

  assert.equal(await readCoolingTemperature(daikin), 21);
  assert.equal(await promisify(callback => daikin.getHeatingTemperature(callback)), 21);
});

test('target temperature reads the AC setpoint while Faikout auto is off', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin.sendGetRequest = (_path, callback) => callback('ret=OK,pow=1,mode=3,stemp=24.0,dt3=24.0,dt7=24.0');
  daikin._updateFaikoutStatus({...status, autoe: false}, 'debug');

  assert.equal(await readCoolingTemperature(daikin), 24);
});

test('setting the target sends the Faikout auto target instead of the AC setpoint', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  const commands = [];
  daikin.sendGetRequest = () => assert.fail('set_control_info should not be used');
  daikin.sendFaikoutWebSocketCommand = (controlData, callback) => {
    commands.push(controlData);
    callback(null);
  };

  daikin._updateFaikoutStatus(status, 'debug');

  await writeCoolingTemperature(daikin, 21.4);
  await promisify(callback => daikin.setHeatingTemperature(22.2, callback));

  assert.deepEqual(commands, [{autot: 21.5}, {autot: 22}]);
  assert.equal(daikin.faikoutStatus.autot, 22);
  assert.equal(daikin.HeaterCooler_HeatingTemperature, 22);
  assert.equal(daikin.HeaterCooler_CoolingTemperature, 22);
});

test('a failed auto target write restores the cached targets', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin.HeaterCooler_HeatingTemperature = 21;
  daikin.HeaterCooler_CoolingTemperature = 21;
  daikin.sendFaikoutWebSocketCommand = (_controlData, callback) => callback(new Error('timed out'));
  daikin._updateFaikoutStatus(status, 'debug');

  await assert.rejects(promisify(callback => daikin.setHeatingTemperature(23, callback)), /timed out/);
  assert.equal(daikin.HeaterCooler_HeatingTemperature, 21);
  assert.equal(daikin.HeaterCooler_CoolingTemperature, 21);
  assert.equal(daikin.faikoutStatus.autot, 21);
});
