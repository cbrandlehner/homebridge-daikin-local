'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createDaikin} = require('./helpers/mock-homebridge.js');

const CONTROL = 'ret=OK,pow=1,mode=3,stemp=24.0,shum=0,f_rate=A,f_dir=1,b_mode=3,b_stemp=24.0,b_f_rate=A,b_f_dir=1';

/** Mock sendGetRequest: answers get_control_info with `body` and set_control_info with `setReply`, records every path. */
function mockRequests(daikin, body, setReply = 'ret=OK') {
  const paths = [];
  daikin.sendGetRequest = (path, callback) => {
    paths.push(path);
    callback(path.includes('/set_control_info') ? setReply : body);
  };

  return paths;
}

test('standard Daikin: separate swing switches read their own f_dir bit', async () => {
  const daikin = createDaikin({enableVerticalSwingSwitch: true, enableHorizontalSwingSwitch: true});
  mockRequests(daikin, CONTROL.replaceAll('f_dir=1', 'f_dir=2'));

  const vertical = await new Promise(resolve => daikin.getVerticalSwing((_error, v) => resolve(v)));
  const horizontal = await new Promise(resolve => daikin.getHorizontalSwing((_error, v) => resolve(v)));

  assert.equal(vertical, false);
  assert.equal(horizontal, true);
});

test('standard Daikin: horizontal switch ON keeps vertical swing (f_dir 1 -> 3)', async () => {
  const daikin = createDaikin({enableVerticalSwingSwitch: true, enableHorizontalSwingSwitch: true});
  const paths = mockRequests(daikin, CONTROL);

  await new Promise(resolve => daikin.setHorizontalSwing(true, resolve));

  const set = paths.find(p => p.includes('/set_control_info'));
  assert.match(set, /[?&]f_dir=3(&|$)/);
  assert.match(set, /b_f_dir=3/);
  assert.match(set, /stemp=24\.0/); // other settings untouched
  assert.equal(daikin.Vertical_Swing, true);
  assert.equal(daikin.Horizontal_Swing, true);
});

test('standard Daikin: vertical switch OFF clears only the vertical bit (f_dir 3 -> 2)', async () => {
  const daikin = createDaikin({enableVerticalSwingSwitch: true, enableHorizontalSwingSwitch: true});
  const paths = mockRequests(daikin, CONTROL.replaceAll('f_dir=1', 'f_dir=3'));

  await new Promise(resolve => daikin.setVerticalSwing(false, resolve));

  const set = paths.find(p => p.includes('/set_control_info'));
  assert.match(set, /[?&]f_dir=2(&|$)/);
  assert.match(set, /b_f_dir=2/);
});

test('outside temperature sensor does not publish 0 before the first real reading', async () => {
  const daikin = createDaikin({enableOutsideTemperatureSensor: true});
  daikin.sendGetRequest = (_path, callback) => callback('ret=OK,otemp=-');

  const result = await new Promise(resolve => {
    daikin.getCurrentOutsideTemperatureFV((error, value) => resolve({error, value}));
  });

  assert.ok(result.error instanceof Error);
  assert.equal(daikin.Outside_CurrentTemperature, null);
});

test('outside temperature sensor reports otemp and keeps the last value when otemp is "-"', async () => {
  const daikin = createDaikin({enableOutsideTemperatureSensor: true, temperatureOffsetOutside: 0});
  let body = 'ret=OK,htemp=25.0,hhum=-,otemp=27.0,err=0,cmpfreq=0';
  daikin.sendGetRequest = (_path, callback) => callback(body);

  daikin.getCurrentOutsideTemperatureFV(() => {});
  assert.equal(daikin.Outside_CurrentTemperature, 27);

  body = 'ret=OK,htemp=25.0,hhum=-,otemp=-,err=0,cmpfreq=0';
  const served = await new Promise(resolve => daikin.getCurrentOutsideTemperatureFV((_error, v) => resolve(v)));
  assert.equal(served, 27);
  assert.equal(daikin.Outside_CurrentTemperature, 27);
});

test('outside temperature sensor is only published when enabled', () => {
  const off = createDaikin({});
  const on = createDaikin({enableOutsideTemperatureSensor: true, outsideTemperatureName: 'Lounge Outside'});
  off.sendGetRequest = () => {};
  on.sendGetRequest = () => {};

  assert.ok(!off.getServices().includes(off.outsideTemperatureService));
  assert.ok(on.getServices().includes(on.outsideTemperatureService));
  assert.equal(on.outsideTemperatureName, 'Lounge Outside');
});

test('standard Daikin: a rejected swing write keeps the cached state and reports an error', async () => {
  const daikin = createDaikin({enableVerticalSwingSwitch: true, enableHorizontalSwingSwitch: true});
  mockRequests(daikin, CONTROL, 'ret=PARAM NG');
  daikin.Vertical_Swing = true;
  daikin.Horizontal_Swing = false;

  const error = await new Promise(resolve => daikin.setHorizontalSwing(true, resolve));

  assert.ok(error instanceof Error);
  assert.equal(daikin.Vertical_Swing, true);
  assert.equal(daikin.Horizontal_Swing, false);
});

test('standard Daikin: a failed swing request still calls the HomeKit callback', async () => {
  const daikin = createDaikin({enableHorizontalSwingSwitch: true});
  daikin._doSendGetRequest = (_path, callback) => {
    const error = new Error('timed out');
    error.status = 403;
    callback(error);
  };

  const error = await new Promise(resolve => daikin.setHorizontalSwing(true, resolve));

  assert.ok(error instanceof Error);
  assert.equal(daikin.Horizontal_Swing, false);
});

test('standard Daikin: the main swing control writes one f_dir and updates both switches', async () => {
  const daikin = createDaikin({
    swingMode: '1',
    enableVerticalSwingSwitch: true,
    enableHorizontalSwingSwitch: true,
    disableFan: true,
  });
  daikin.Vertical_Swing = true;
  daikin.Horizontal_Swing = true;
  const paths = mockRequests(daikin, CONTROL.replaceAll('f_dir=1', 'f_dir=3'));

  await new Promise((resolve, reject) => {
    daikin.setSwingMode(0, error => error ? reject(error) : resolve());
  });

  const off = paths.find(path => path.includes('/set_control_info'));
  assert.match(off, /[?&]f_dir=0(&|$)/);
  assert.equal(daikin.Vertical_Swing, false);
  assert.equal(daikin.Horizontal_Swing, false);
  assert.equal(daikin.HeaterCooler_SwingMode, 0);

  paths.length = 0;
  await new Promise((resolve, reject) => {
    daikin.setSwingMode(1, error => error ? reject(error) : resolve());
  });

  const on = paths.find(path => path.includes('/set_control_info'));
  assert.match(on, /[?&]f_dir=1(&|$)/);
  assert.equal(daikin.Vertical_Swing, true);
  assert.equal(daikin.Horizontal_Swing, false);
  assert.equal(daikin.HeaterCooler_SwingMode, 1);
});

test('standard Daikin: main swing shows enabled for horizontal-only swing (f_dir 2)', async () => {
  const daikin = createDaikin({swingMode: '1', enableVerticalSwingSwitch: true, enableHorizontalSwingSwitch: true});
  mockRequests(daikin, CONTROL.replaceAll('f_dir=1', 'f_dir=0'));

  await new Promise(resolve => daikin.setHorizontalSwing(true, resolve));

  assert.equal(daikin.HeaterCooler_SwingMode, 1); // SWING_ENABLED
});
