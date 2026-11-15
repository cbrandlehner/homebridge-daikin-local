'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const https = require('node:https');
const {isIP} = require('node:net');
const {createDaikin} = require('./helpers/mock-homebridge.js');

/**
 * Replace https.request so a Daikin HTTPS call can be inspected without a socket.
 *
 * @returns {{servername: string|undefined, restore: function(): void}}
 */
function captureServername() {
  const original = https.request;
  const captured = {};

  https.request = options => {
    captured.servername = options.servername;
    const request = new EventEmitter();
    request.setNoDelay = () => {};
    request.setHeader = () => {};
    request.getHeader = () => {};
    request.setTimeout = () => request;
    request.write = () => true;
    request.abort = () => {};
    request.destroy = () => {};
    request.end = () => {
      const error = new Error('stopped');
      error.code = 'ENETUNREACH';
      queueMicrotask(() => request.emit('error', error));
    };
    return request;
  };

  return {
    get servername() {
      return captured.servername;
    },
    restore() {
      https.request = original;
    },
  };
}

test('HTTPS requests to an IP do not set the TLS servername to that IP', async () => {
  const daikin = createDaikin({
    apiroute: 'https://192.168.1.20',
    retries: 0,
    response: 50,
    deadline: 50,
  });
  const capture = captureServername();

  try {
    daikin._doSendGetRequest(daikin.get_sensor_info, () => {}, {skipCache: true});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(isIP(capture.servername || ''), 0);
  } finally {
    capture.restore();
  }
});

test('HTTPS requests to a hostname still send that name as the TLS servername', async () => {
  const daikin = createDaikin({
    apiroute: 'https://daikin.local',
    retries: 0,
    response: 50,
    deadline: 50,
  });
  daikin._resolveHost = callback => callback('daikin.local');
  const capture = captureServername();

  try {
    daikin._doSendGetRequest(daikin.get_sensor_info, () => {}, {skipCache: true});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(capture.servername, 'daikin.local');
  } finally {
    capture.restore();
  }
});
