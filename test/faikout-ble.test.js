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
  assert.equal(await readCoolingTemperature(daikin), 22);
  assert.equal(daikin.HeaterCooler_HeatingTemperature, 22);
  assert.equal(daikin.HeaterCooler_CoolingTemperature, 22);
});

test('setting the target does not write the AC setpoint when Faikout status is stale', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin.sendGetRequest = () => assert.fail('AC setpoint should not be written');
  daikin.sendFaikoutWebSocketCommand = () => assert.fail('auto target should not be sent without status');
  daikin._updateFaikoutStatus(status, 'debug');
  daikin.faikoutStatusTime = Date.now() - (5 * 60 * 1000);
  daikin.HeaterCooler_HeatingTemperature = 21;
  daikin.HeaterCooler_CoolingTemperature = 21;

  await assert.rejects(writeCoolingTemperature(daikin, 23), /Faikout status is not available/);
  await assert.rejects(promisify(callback => daikin.setHeatingTemperature(22, callback)), /Faikout status is not available/);
  assert.equal(daikin.HeaterCooler_HeatingTemperature, 21);
  assert.equal(daikin.HeaterCooler_CoolingTemperature, 21);
  assert.equal(daikin.faikoutPendingAutoTarget, null);
});

test('setting the target writes the AC setpoint while Faikout auto is off', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  const requests = [];
  daikin.sendFaikoutWebSocketCommand = () => assert.fail('auto target should not be sent');
  daikin.sendGetRequest = (path, callback) => {
    requests.push(path);
    callback(path.includes('set_control_info')
      ? 'ret=OK'
      : 'ret=OK,pow=1,mode=3,stemp=24.0,dt3=24.0,dt7=24.0');
  };
  daikin._updateFaikoutStatus({...status, autoe: false}, 'debug');

  await writeCoolingTemperature(daikin, 22);
  await promisify(callback => daikin.setHeatingTemperature(19, callback));

  const setRequests = requests.filter(path => path.includes('set_control_info'));
  assert.equal(setRequests.length, 2);
  assert.match(setRequests[0], /stemp=22\.0/);
  assert.match(setRequests[1], /stemp=19\.0/);
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

test('a cached read while an auto target write is pending keeps the new target', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin.sendGetRequest = () => assert.fail('AC setpoint should not be read');
  daikin.HeaterCooler_HeatingTemperature = 21;
  daikin.HeaterCooler_CoolingTemperature = 21;
  let finishWrite;
  daikin.sendFaikoutWebSocketCommand = (_controlData, callback) => {
    finishWrite = callback;
  };

  daikin._updateFaikoutStatus(status, 'debug');

  const write = promisify(callback => daikin.setHeatingTemperature(23, callback));
  await promisify(callback => daikin.getCoolingTemperatureFV(callback));
  await promisify(callback => daikin.getHeatingTemperatureFV(callback));
  finishWrite(null);
  await write;

  assert.equal(daikin.HeaterCooler_HeatingTemperature, 23);
  assert.equal(daikin.HeaterCooler_CoolingTemperature, 23);
  assert.equal(await readCoolingTemperature(daikin), 23);
});

function startPendingWrites(daikin, targets) {
  const finishers = [];
  daikin.sendFaikoutWebSocketCommand = (_controlData, callback) => {
    finishers.push(callback);
  };

  const writes = targets.map(target => promisify(callback => daikin.setHeatingTemperature(target, callback)).then(
    () => 'ok',
    error => error.message,
  ));
  return {finishers, writes};
}

test('two overlapping auto target writes that both fail restore the confirmed target', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin._updateFaikoutStatus(status, 'debug');

  const {finishers, writes} = startPendingWrites(daikin, [23, 24]);
  assert.equal(await readCoolingTemperature(daikin), 24);

  finishers[0](new Error('first failed'));
  assert.equal(await readCoolingTemperature(daikin), 24);
  finishers[1](new Error('second failed'));

  assert.deepEqual(await Promise.all(writes), ['first failed', 'second failed']);
  assert.equal(await readCoolingTemperature(daikin), 21);
  assert.equal(daikin.faikoutStatus.autot, 21);
  assert.equal(daikin.HeaterCooler_HeatingTemperature, 21);
  assert.equal(daikin.HeaterCooler_CoolingTemperature, 21);
});

test('an older auto target write finishing late does not override a newer one', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin._updateFaikoutStatus(status, 'debug');

  const {finishers, writes} = startPendingWrites(daikin, [23, 24]);
  finishers[1](null);
  finishers[0](null);

  assert.deepEqual(await Promise.all(writes), ['ok', 'ok']);
  assert.equal(daikin.HeaterCooler_HeatingTemperature, 24);
  assert.equal(daikin.HeaterCooler_CoolingTemperature, 24);
});

test('when only the newer auto target write fails, the older confirmed target is restored', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin._updateFaikoutStatus(status, 'debug');

  const {finishers, writes} = startPendingWrites(daikin, [23, 24]);
  finishers[0](null);
  daikin._updateFaikoutStatus({autot: 23}, 'debug');
  finishers[1](new Error('second failed'));

  assert.deepEqual(await Promise.all(writes), ['ok', 'second failed']);
  assert.equal(await readCoolingTemperature(daikin), 23);
  assert.equal(daikin.HeaterCooler_HeatingTemperature, 23);
  assert.equal(daikin.HeaterCooler_CoolingTemperature, 23);
});

test('a status message sent before the unit applied the new target does not undo it', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin.sendFaikoutWebSocketCommand = (_controlData, callback) => callback(null);
  daikin._updateFaikoutStatus(status, 'debug');

  await promisify(callback => daikin.setHeatingTemperature(23, callback));
  daikin._updateFaikoutStatus({autot: 21}, 'debug');
  assert.equal(await readCoolingTemperature(daikin), 23);

  daikin._updateFaikoutStatus({autot: 23}, 'debug');
  assert.equal(daikin.faikoutPendingAutoTarget, null);
  assert.equal(await readCoolingTemperature(daikin), 23);
});

test('a sent target the unit never reports back expires and the reported target is shown', async () => {
  const daikin = createFaikout({faikoutUseAutoTarget: true});
  daikin.sendFaikoutWebSocketCommand = (_controlData, callback) => callback(null);
  daikin._updateFaikoutStatus(status, 'debug');

  await promisify(callback => daikin.setHeatingTemperature(23, callback));
  daikin.faikoutPendingAutoTarget.time = Date.now() - (60 * 1000);
  daikin._updateFaikoutStatus({autot: 21}, 'debug');

  assert.equal(await readCoolingTemperature(daikin), 21);
  assert.equal(daikin.faikoutPendingAutoTarget, null);
});

test('an old BLE reading is not used once status messages stop carrying it', async () => {
  const daikin = createFaikout({faikoutUseBleSensor: true, temperatureOffsetInside: 0});
  daikin.sendGetRequest = (_path, callback) => callback('ret=OK,htemp=23.0,otemp=7.0');
  daikin._updateFaikoutStatus(status, 'debug');
  daikin.faikoutBleTime = Date.now() - (5 * 60 * 1000);
  daikin._updateFaikoutStatus({home: 23}, 'debug');

  assert.equal(await readCurrentTemperature(daikin), 23);
});
