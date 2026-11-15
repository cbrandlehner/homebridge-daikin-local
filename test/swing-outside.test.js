'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createDaikin} = require('./helpers/mock-homebridge.js');

const CONTROL = 'ret=OK,pow=1,mode=3,stemp=24.0,shum=0,f_rate=A,f_dir=1,b_mode=3,b_stemp=24.0,b_f_rate=A,b_f_dir=1';

/** Mock sendGetRequest: answers get_control_info with `body`, records every path. */
function mockRequests(daikin, body) {
  const paths = [];
  daikin.sendGetRequest = (path, callback) => {
    paths.push(path);
    callback(path.includes('/set_control_info') ? 'ret=OK' : body);
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
