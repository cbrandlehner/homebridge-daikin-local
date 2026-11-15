'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createDaikin} = require('./helpers/mock-homebridge.js');

const CONTROL = 'ret=OK,pow=0,mode=3,stemp=24.0,shum=0,f_rate=A,f_dir=0';

function httpError(message, fields) {
  const error = new Error(message);
  Object.assign(error, fields);
  return error;
}

test('a rejected power request calls the HomeKit callback and keeps the cached state', {timeout: 2000}, async () => {
  const daikin = createDaikin();
  daikin.HeaterCooler_Active = 0;
  daikin._doSendGetRequest = (_path, callback) => {
    callback(httpError('forbidden', {status: 403}));
  };

  const error = await new Promise(resolve => daikin.setActive(1, resolve));

  assert.equal(error.status, 403);
  assert.equal(daikin.HeaterCooler_Active, 0);
});

test('a rejected control write rolls the optimistic cache back', {timeout: 2000}, async () => {
  const daikin = createDaikin();
  daikin.HeaterCooler_Active = 0;
  daikin._doSendGetRequest = (path, callback) => {
    if (path.includes('/set_control_info')) {
      callback(httpError('forbidden', {status: 403}));
      return;
    }

    callback(null, CONTROL);
  };

  const error = await new Promise(resolve => daikin.setActive(1, resolve));

  assert.equal(error.status, 403);
  assert.equal(daikin.HeaterCooler_Active, 0);
});

test('ECONNRESET is tried three times and then fails the HomeKit callback', {timeout: 2000}, async () => {
  const daikin = createDaikin();
  daikin.HeaterCooler_Active = 0;
  let attempts = 0;
  daikin._doSendGetRequest = (_path, callback) => {
    attempts += 1;
    callback(httpError('reset', {code: 'ECONNRESET'}));
  };

  const error = await new Promise(resolve => daikin.setActive(1, resolve));

  assert.equal(attempts, 3);
  assert.equal(error.code, 'ECONNRESET');
  assert.equal(daikin.HeaterCooler_Active, 0);
});

test('one ECONNRESET then a successful read still applies the power change', {timeout: 2000}, async () => {
  const daikin = createDaikin();
  daikin.HeaterCooler_Active = 0;
  const calls = [];
  let resets = 0;
  daikin._doSendGetRequest = (path, callback) => {
    calls.push(path);
    if (path.includes('/get_control_info') && resets < 1) {
      resets += 1;
      callback(httpError('reset', {code: 'ECONNRESET'}));
      return;
    }

    callback(null, path.includes('/set_control_info') ? 'ret=OK' : CONTROL);
  };

  const error = await new Promise(resolve => daikin.setActive(1, resolve));
  const setPath = calls.find(path => path.includes('/set_control_info'));

  assert.equal(error, undefined);
  assert.equal(resets, 1);
  assert.match(setPath, /[?&]pow=1(&|$)/);
  assert.equal(daikin.HeaterCooler_Active, 1);
});

test('three write resets restore the previous power and leave the queue usable', {timeout: 2000}, async () => {
  const daikin = createDaikin();
  daikin.HeaterCooler_Active = 0;
  let setAttempts = 0;
  daikin._doSendGetRequest = (path, callback) => {
    if (path.includes('/set_control_info')) {
      setAttempts += 1;
      callback(httpError('reset', {code: 'ECONNRESET'}));
      return;
    }

    if (path.includes('/later')) {
      callback(null, 'ret=OK,pow=0');
      return;
    }

    callback(null, CONTROL);
  };

  const error = await new Promise(resolve => daikin.setActive(1, resolve));
  const body = await new Promise(resolve => {
    daikin.sendGetRequest('http://192.168.1.50/later', resolve);
  });

  assert.equal(setAttempts, 3);
  assert.equal(error.code, 'ECONNRESET');
  assert.equal(daikin.HeaterCooler_Active, 0);
  assert.equal(body, 'ret=OK,pow=0');
});

test('a failed read without onError does not call the body callback, and the next request still runs', {timeout: 2000}, async () => {
  const daikin = createDaikin();
  let bodyCallbackRan = false;
  daikin._doSendGetRequest = (path, callback) => {
    if (path.includes('/first')) {
      callback(httpError('forbidden', {status: 403}));
      return;
    }

    callback(null, 'ret=OK,pow=1');
  };

  daikin.sendGetRequest('http://192.168.1.50/first', () => {
    bodyCallbackRan = true;
  });
  const body = await new Promise(resolve => {
    daikin.sendGetRequest('http://192.168.1.50/second', resolve);
  });

  assert.equal(bodyCallbackRan, false);
  assert.equal(body, 'ret=OK,pow=1');
});

test('turning Econo on rolls exclusive modes back when the adapter rejects the read', {timeout: 2000}, async () => {
  const daikin = createDaikin();
  daikin.Econo_Mode = false;
  daikin.Powerful_Mode = true;
  daikin.NightQuiet_Mode = false;
  daikin._doSendGetRequest = (_path, callback) => {
    callback(httpError('forbidden', {status: 403}));
  };

  const error = await new Promise(resolve => daikin.setEconoMode(true, resolve));

  assert.equal(error.status, 403);
  assert.equal(daikin.Econo_Mode, false);
  assert.equal(daikin.Powerful_Mode, true);
  assert.equal(daikin.NightQuiet_Mode, false);
});
