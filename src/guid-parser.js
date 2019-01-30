// @flow

const MAP = [
  '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '0a', '0b', '0c', '0d', '0e', '0f',
  '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '1a', '1b', '1c', '1d', '1e', '1f',
  '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '2a', '2b', '2c', '2d', '2e', '2f',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '3a', '3b', '3c', '3d', '3e', '3f',
  '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '4a', '4b', '4c', '4d', '4e', '4f',
  '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '5a', '5b', '5c', '5d', '5e', '5f',
  '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '6a', '6b', '6c', '6d', '6e', '6f',
  '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '7a', '7b', '7c', '7d', '7e', '7f',
  '80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '8a', '8b', '8c', '8d', '8e', '8f',
  '90', '91', '92', '93', '94', '95', '96', '97', '98', '99', '9a', '9b', '9c', '9d', '9e', '9f',
  'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'aa', 'ab', 'ac', 'ad', 'ae', 'af',
  'b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'ba', 'bb', 'bc', 'bd', 'be', 'bf',
  'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'ca', 'cb', 'cc', 'cd', 'ce', 'cf',
  'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'da', 'db', 'dc', 'dd', 'de', 'df',
  'e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'ea', 'eb', 'ec', 'ed', 'ee', 'ef',
  'f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'fa', 'fb', 'fc', 'fd', 'fe', 'ff'
];

module.exports.arrayToGuid = arrayToGuid;
function arrayToGuid(array: Array<number>) {
  return (
    MAP[array[3]] +
    MAP[array[2]] +
    MAP[array[1]] +
    MAP[array[0]] +
    '-' +
    MAP[array[5]] +
    MAP[array[4]] +
    '-' +
    MAP[array[7]] +
    MAP[array[6]] +
    '-' +
    MAP[array[8]] +
    MAP[array[9]] +
    '-' +
    MAP[array[10]] +
    MAP[array[11]] +
    MAP[array[12]] +
    MAP[array[13]] +
    MAP[array[14]] +
    MAP[array[15]]
  );
}

const CHARCODEMAP = {};

const hexDigits = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'a', 'b', 'c', 'd', 'e', 'f',
  'A', 'B', 'C', 'D', 'E', 'F'
].map((d) => d.charCodeAt(0));

for (let i = 0; i < hexDigits.length; i++) {
  const map = CHARCODEMAP[hexDigits[i]] = {};
  for (let j = 0; j < hexDigits.length; j++) {
    const hex = String.fromCharCode(hexDigits[i], hexDigits[j]);
    const value = parseInt(hex, 16);
    map[hexDigits[j]] = value;
  }
}

module.exports.guidToArray = guidToArray;
function guidToArray(guid: string) {
  return [
    CHARCODEMAP[guid.charCodeAt(6)][guid.charCodeAt(7)],
    CHARCODEMAP[guid.charCodeAt(4)][guid.charCodeAt(5)],
    CHARCODEMAP[guid.charCodeAt(2)][guid.charCodeAt(3)],
    CHARCODEMAP[guid.charCodeAt(0)][guid.charCodeAt(1)],
    CHARCODEMAP[guid.charCodeAt(11)][guid.charCodeAt(12)],
    CHARCODEMAP[guid.charCodeAt(9)][guid.charCodeAt(10)],
    CHARCODEMAP[guid.charCodeAt(16)][guid.charCodeAt(17)],
    CHARCODEMAP[guid.charCodeAt(14)][guid.charCodeAt(15)],
    CHARCODEMAP[guid.charCodeAt(19)][guid.charCodeAt(20)],
    CHARCODEMAP[guid.charCodeAt(21)][guid.charCodeAt(22)],
    CHARCODEMAP[guid.charCodeAt(24)][guid.charCodeAt(25)],
    CHARCODEMAP[guid.charCodeAt(26)][guid.charCodeAt(27)],
    CHARCODEMAP[guid.charCodeAt(28)][guid.charCodeAt(29)],
    CHARCODEMAP[guid.charCodeAt(30)][guid.charCodeAt(31)],
    CHARCODEMAP[guid.charCodeAt(32)][guid.charCodeAt(33)],
    CHARCODEMAP[guid.charCodeAt(34)][guid.charCodeAt(35)]
  ];
}
