function formatHex(number) {
  let hex = number.toString(16);
  if (hex.length === 1) {
    hex = '0' + hex;
  }
  return hex;
}

export function arrayToGuid(array) {
  return (
    formatHex(array[3]) +
    formatHex(array[2]) +
    formatHex(array[1]) +
    formatHex(array[0]) +
    '-' +
    formatHex(array[5]) +
    formatHex(array[4]) +
    '-' +
    formatHex(array[7]) +
    formatHex(array[6]) +
    '-' +
    formatHex(array[8]) +
    formatHex(array[9]) +
    '-' +
    formatHex(array[10]) +
    formatHex(array[11]) +
    formatHex(array[12]) +
    formatHex(array[13]) +
    formatHex(array[14]) +
    formatHex(array[15])
  ).toUpperCase();
}

export function guidToArray(guid) {
  return [
    parseInt(guid.substring(6, 8), 16),
    parseInt(guid.substring(4, 6), 16),
    parseInt(guid.substring(2, 4), 16),
    parseInt(guid.substring(0, 2), 16),
    parseInt(guid.substring(11, 13), 16),
    parseInt(guid.substring(9, 11), 16),
    parseInt(guid.substring(16, 18), 16),
    parseInt(guid.substring(14, 16), 16),
    parseInt(guid.substring(19, 21), 16),
    parseInt(guid.substring(21, 23), 16),
    parseInt(guid.substring(24, 26), 16),
    parseInt(guid.substring(26, 28), 16),
    parseInt(guid.substring(28, 30), 16),
    parseInt(guid.substring(30, 32), 16),
    parseInt(guid.substring(32, 34), 16),
    parseInt(guid.substring(34, 36), 16)
  ];
}
