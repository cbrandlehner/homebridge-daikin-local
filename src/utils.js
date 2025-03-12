function parseResponse(response) {
  const vals = {};
  if (response) {
    const items = response.split(',');
    const length = items.length;
    for (let i = 0; i < length; i++) {
      const keyValue = items[i].split('=');
      vals[keyValue[0]] = keyValue[1];
    }
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
    {min: 80, max: 100, value: '7'},
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
  daikinSpeedToRaw,
  rawToDaikinSpeed,
};
