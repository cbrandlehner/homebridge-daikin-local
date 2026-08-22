'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTemperatureDisplayUnits,
  daikinSpeedToRaw,
  rawToDaikinSpeed,
  daikinToFaikoutFanRate,
} = require('../src/utils.js');

const TemperatureDisplayUnits = {
  CELSIUS: 0,
  FAHRENHEIT: 1,
};

test('parseTemperatureDisplayUnits defaults to Celsius', () => {
  assert.equal(parseTemperatureDisplayUnits('C', TemperatureDisplayUnits), TemperatureDisplayUnits.CELSIUS);
  assert.equal(parseTemperatureDisplayUnits(undefined, TemperatureDisplayUnits), TemperatureDisplayUnits.CELSIUS);
});

test('parseTemperatureDisplayUnits accepts Fahrenheit aliases', () => {
  assert.equal(parseTemperatureDisplayUnits('F', TemperatureDisplayUnits), TemperatureDisplayUnits.FAHRENHEIT);
  assert.equal(parseTemperatureDisplayUnits('1', TemperatureDisplayUnits), TemperatureDisplayUnits.FAHRENHEIT);
  assert.equal(parseTemperatureDisplayUnits(1, TemperatureDisplayUnits), TemperatureDisplayUnits.FAHRENHEIT);
});

test('daikinSpeedToRaw maps known fan rates', () => {
  assert.equal(daikinSpeedToRaw('A'), 15);
  assert.equal(daikinSpeedToRaw('B'), 5);
  assert.equal(daikinSpeedToRaw('7'), 100);
});

test('rawToDaikinSpeed maps HomeKit percentages back to Daikin rates', () => {
  assert.equal(rawToDaikinSpeed(5), 'B');
  assert.equal(rawToDaikinSpeed(15), 'A');
  assert.equal(rawToDaikinSpeed(25), '3');
  assert.equal(rawToDaikinSpeed(90), '7');
  assert.equal(rawToDaikinSpeed(100), '7');
});

test('daikinToFaikoutFanRate maps Daikin rates to Faikout fan values', () => {
  assert.equal(daikinToFaikoutFanRate('A'), 'A');
  assert.equal(daikinToFaikoutFanRate('B'), 'Q');
  assert.equal(daikinToFaikoutFanRate('3'), '1');
  assert.equal(daikinToFaikoutFanRate('4'), '2');
  assert.equal(daikinToFaikoutFanRate('5'), '3');
  assert.equal(daikinToFaikoutFanRate('6'), '4');
  assert.equal(daikinToFaikoutFanRate('7'), '5');
  assert.equal(daikinToFaikoutFanRate('X'), 'A');
});
