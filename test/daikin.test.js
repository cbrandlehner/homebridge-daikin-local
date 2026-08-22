'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {parseResponse} = require('../src/utils.js');
const {
  createDaikin,
  readCurrentTemperature,
  readFanSpeed,
  readHeaterCoolerState,
  readCoolingTemperature,
  writeCoolingTemperature,
} = require('./helpers/mock-homebridge.js');

test('Daikin uses parseResponse for API payloads', () => {
  const daikin = createDaikin();
  const body = 'ret=OK,htemp=21.5,otemp=12.0';

  assert.deepEqual(daikin.parseResponse(body), parseResponse(body));
});

test('getCurrentTemperature applies the configured inside offset', async () => {
  const daikin = createDaikin({temperatureOffsetInside: 1.5});
  daikin.sendGetRequest = (_path, callback) => {
    callback('ret=OK,htemp=22.0,otemp=10.0');
  };

  const temperature = await readCurrentTemperature(daikin);

  assert.equal(temperature, 23.5);
});

test('getFanSpeed maps Daikin fan rates to HomeKit percentages', async () => {
  const daikin = createDaikin();
  daikin.sendGetRequest = (_path, callback) => {
    callback('ret=OK,pow=1,mode=3,f_rate=5');
  };

  const fanSpeed = await readFanSpeed(daikin);

  assert.equal(fanSpeed, 50);
});

test('Default system builds standard Daikin API routes', () => {
  const daikin = createDaikin({apiroute: 'https://192.168.1.77'});

  assert.equal(daikin.get_sensor_info, 'https://192.168.1.77/aircon/get_sensor_info');
  assert.equal(daikin.get_control_info, 'https://192.168.1.77/aircon/get_control_info');
  assert.equal(daikin.basic_info, 'https://192.168.1.77/common/basic_info');
});

test('Skyfi system builds skyfi API routes', () => {
  const daikin = createDaikin({
    apiroute: 'https://192.168.1.77',
    system: 'Skyfi',
  });

  assert.equal(daikin.get_sensor_info, 'https://192.168.1.77/skyfi/aircon/get_sensor_info');
  assert.equal(daikin.get_control_info, 'https://192.168.1.77/skyfi/aircon/get_control_info');
  assert.equal(daikin.basic_info, 'https://192.168.1.77/skyfi/common/basic_info');
});

test('getHeaterCoolerState reports heating when mode is 4', async () => {
  const daikin = createDaikin();
  daikin.sendGetRequest = (_path, callback) => {
    callback('ret=OK,pow=1,mode=4,stemp=20.0,dt3=20.0,dt5=20.0,dt7=23.0');
  };

  const state = await readHeaterCoolerState(daikin);

  assert.equal(state, 2);
});

test('getCoolingTemperature reads dt7 while unit is heating', async () => {
  const daikin = createDaikin();
  daikin.sendGetRequest = (_path, callback) => {
    callback('ret=OK,pow=1,mode=4,stemp=20.0,dt3=20.0,dt5=20.0,dt7=23.0');
  };

  const temperature = await readCoolingTemperature(daikin);

  assert.equal(temperature, 23);
});

test('setCoolingTemperature routes to heating setpoint when mode is 4', async () => {
  const daikin = createDaikin();
  const requests = [];

  daikin.sendGetRequest = (path, callback) => {
    requests.push(path);

    if (path.includes('get_control_info')) {
      callback('ret=OK,pow=1,mode=4,stemp=20.0,dt3=20.0,dt5=18.0,dt7=23.0');
      return;
    }

    callback('ret=OK,adv=');
  };

  await writeCoolingTemperature(daikin, 16);

  const setRequest = requests.find(path => path.includes('set_control_info'));
  assert.match(setRequest, /stemp=16\.0/);
  assert.match(setRequest, /dt5=16\.0/);
  assert.doesNotMatch(setRequest, /dt7=16\.0/);
});

test('Faikout system enables Faikout mode', () => {
  const daikin = createDaikin({
    apiroute: 'http://192.168.1.88',
    system: 'Faikout',
  });

  assert.equal(daikin.isFaikout, true);
  assert.equal(daikin.get_control_info, 'http://192.168.1.88/aircon/get_control_info');
});

test('legacy Faikin system config still enables Faikout mode', () => {
  const daikin = createDaikin({
    apiroute: 'http://192.168.1.88',
    system: 'Faikin',
  });

  assert.equal(daikin.isFaikout, true);
});

test('Faikout setFanSpeed sends native fan values over the control channel', () => {
  const daikin = createDaikin({
    apiroute: 'http://192.168.1.88',
    system: 'Faikout',
  });

  const sent = [];
  daikin.sendFaikoutWebSocketCommand = (controlData, callback) => {
    sent.push(controlData);
    if (callback) callback(null);
  };

  daikin.setFanSpeed(100, () => {});
  daikin.setFanSpeed(25, () => {});
  daikin.setFanSpeed(15, () => {});
  daikin.setFanSpeed(5, () => {});

  assert.deepEqual(sent, [{fan: '5'}, {fan: '1'}, {fan: 'A'}, {fan: 'Q'}]);
});

test('Faikout reuses a connecting WebSocket for concurrent commands', async () => {
  let connections = 0;
  let options;
  class FakeWebSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;

    constructor(_url, socketOptions) {
      super();
      connections++;
      options = socketOptions;
      this.readyState = FakeWebSocket.CONNECTING;
      setImmediate(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.emit('open');
      });
    }

    send(message, callback) {
      if (message && callback) callback();
    }

    close() {
      this.readyState = 3;
      this.emit('close');
    }
  }

  const daikin = createDaikin({system: 'Faikout'});
  daikin.WebSocket = FakeWebSocket;
  daikin._resolveHost = callback => callback('127.0.0.1');

  await Promise.all([
    new Promise((resolve, reject) => daikin.sendFaikoutWebSocketCommand({fan: 'A'}, error => error ? reject(error) : resolve())),
    new Promise((resolve, reject) => daikin.sendFaikoutWebSocketCommand({swingv: true}, error => error ? reject(error) : resolve())),
  ]);

  assert.equal(connections, 1);
  assert.equal(options.handshakeTimeout, 9000);
  daikin.closeFaikoutWebSocket();
});

test('Faikout command callbacks expire instead of hanging HomeKit', async () => {
  const daikin = createDaikin({system: 'Faikout', deadline: 10});
  daikin.connectFaikoutWebSocket = () => {};

  const error = await new Promise(resolve => {
    daikin.sendFaikoutWebSocketCommand({fan: 'A'}, resolve);
  });

  assert.match(error.message, /timed out/);
  assert.equal(daikin.faikoutWsPendingCommands.length, 0);
});

test('Faikout restores cached state when a control command fails', async () => {
  const daikin = createDaikin({
    system: 'Faikout',
    enableVerticalSwingSwitch: true,
    enableHorizontalSwingSwitch: true,
    enableEconoMode: true,
    enablePowerfulMode: true,
  });
  daikin.sendFaikoutControl = (_controlData, callback) => callback(new Error('timed out'));

  daikin.HeaterCooler_SwingMode = 0;
  daikin.Vertical_Swing = false;
  daikin.Horizontal_Swing = false;
  const swingError = await new Promise(resolve => daikin.setSwingMode(1, resolve));
  assert.match(swingError.message, /timed out/);
  assert.equal(daikin.HeaterCooler_SwingMode, 0);
  assert.equal(daikin.Vertical_Swing, false);
  assert.equal(daikin.Horizontal_Swing, false);

  daikin.Vertical_Swing = false;
  daikin.HeaterCooler_SwingMode = 0;
  const verticalError = await new Promise(resolve => daikin.setVerticalSwing(true, resolve));
  assert.match(verticalError.message, /timed out/);
  assert.equal(daikin.Vertical_Swing, false);
  assert.equal(daikin.HeaterCooler_SwingMode, 0);

  daikin.Fan_Speed = 50;
  const fanError = await new Promise(resolve => daikin.setFanSpeed(100, resolve));
  assert.match(fanError.message, /timed out/);
  assert.equal(daikin.Fan_Speed, 50);

  daikin.Econo_Mode = false;
  daikin.Powerful_Mode = true;
  const econoError = await new Promise(resolve => daikin.setEconoMode(true, resolve));
  assert.match(econoError.message, /timed out/);
  assert.equal(daikin.Econo_Mode, false);
  assert.equal(daikin.Powerful_Mode, true);
});
