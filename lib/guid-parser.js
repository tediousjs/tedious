'use strict';

var MAP = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '0A', '0B', '0C', '0D', '0E', '0F', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '1A', '1B', '1C', '1D', '1E', '1F', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '2A', '2B', '2C', '2D', '2E', '2F', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '3A', '3B', '3C', '3D', '3E', '3F', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '4A', '4B', '4C', '4D', '4E', '4F', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '5A', '5B', '5C', '5D', '5E', '5F', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '6A', '6B', '6C', '6D', '6E', '6F', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '7A', '7B', '7C', '7D', '7E', '7F', '80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '8A', '8B', '8C', '8D', '8E', '8F', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99', '9A', '9B', '9C', '9D', '9E', '9F', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'EA', 'EB', 'EC', 'ED', 'EE', 'EF', 'F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'FA', 'FB', 'FC', 'FD', 'FE', 'FF'];

module.exports.arrayToGuid = arrayToGuid;
function arrayToGuid(array) {
  return MAP[array[3]] + MAP[array[2]] + MAP[array[1]] + MAP[array[0]] + '-' + MAP[array[5]] + MAP[array[4]] + '-' + MAP[array[7]] + MAP[array[6]] + '-' + MAP[array[8]] + MAP[array[9]] + '-' + MAP[array[10]] + MAP[array[11]] + MAP[array[12]] + MAP[array[13]] + MAP[array[14]] + MAP[array[15]];
}

var CHARCODEMAP = {};

var hexDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'A', 'B', 'C', 'D', 'E', 'F'].map(function (d) {
  return d.charCodeAt(0);
});

for (var i = 0; i < hexDigits.length; i++) {
  var map = CHARCODEMAP[hexDigits[i]] = {};
  for (var j = 0; j < hexDigits.length; j++) {
    var hex = String.fromCharCode(hexDigits[i], hexDigits[j]);
    var value = parseInt(hex, 16);
    map[hexDigits[j]] = value;
  }
}

module.exports.guidToArray = guidToArray;
function guidToArray(guid) {
  return [CHARCODEMAP[guid.charCodeAt(6)][guid.charCodeAt(7)], CHARCODEMAP[guid.charCodeAt(4)][guid.charCodeAt(5)], CHARCODEMAP[guid.charCodeAt(2)][guid.charCodeAt(3)], CHARCODEMAP[guid.charCodeAt(0)][guid.charCodeAt(1)], CHARCODEMAP[guid.charCodeAt(11)][guid.charCodeAt(12)], CHARCODEMAP[guid.charCodeAt(9)][guid.charCodeAt(10)], CHARCODEMAP[guid.charCodeAt(16)][guid.charCodeAt(17)], CHARCODEMAP[guid.charCodeAt(14)][guid.charCodeAt(15)], CHARCODEMAP[guid.charCodeAt(19)][guid.charCodeAt(20)], CHARCODEMAP[guid.charCodeAt(21)][guid.charCodeAt(22)], CHARCODEMAP[guid.charCodeAt(24)][guid.charCodeAt(25)], CHARCODEMAP[guid.charCodeAt(26)][guid.charCodeAt(27)], CHARCODEMAP[guid.charCodeAt(28)][guid.charCodeAt(29)], CHARCODEMAP[guid.charCodeAt(30)][guid.charCodeAt(31)], CHARCODEMAP[guid.charCodeAt(32)][guid.charCodeAt(33)], CHARCODEMAP[guid.charCodeAt(34)][guid.charCodeAt(35)]];
}