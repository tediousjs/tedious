'use strict';

var Packet, TYPE, isPacketComplete;

require('../../src/buffertools');

Packet = require('../../src/packet').Packet;

TYPE = require('../../src/packet').TYPE;

isPacketComplete = require('../../src/packet').isPacketComplete;

exports.createEmpty = function(test) {
  var packet;
  packet = new Packet(TYPE.PRELOGIN);
  test.ok(packet);
  test.ok(packet.buffer.equals(new Buffer([TYPE.PRELOGIN, 0, 0, 8, 0, 0, 1, 0])));
  return test.done();
};

exports.last = function(test) {
  var packet;
  packet = new Packet(TYPE.PRELOGIN);
  test.ok(!packet.isLast());
  packet = new Packet(TYPE.PRELOGIN);
  test.ok(!packet.last());
  packet.last(true);
  test.ok(packet.last());
  return test.done();
};

exports.packetId = function(test) {
  var packet;
  packet = new Packet(TYPE.PRELOGIN);
  test.strictEqual(packet.packetId(), 1);
  packet.packetId(2);
  test.strictEqual(packet.packetId(), 2);
  return test.done();
};

exports.data = function(test) {
  var allData, data1, data2, packet;
  data1 = new Buffer([0x01, 0x02, 0x03]);
  data2 = new Buffer([0xFF, 0xFE]);
  allData = Buffer.concat([data1, data2]);
  packet = new Packet(TYPE.PRELOGIN);
  test.strictEqual(packet.length(), 8);
  test.ok(packet.data().equals(new Buffer(0)));
  packet.addData(data1);
  test.strictEqual(packet.length(), 8 + data1.length);
  test.ok(packet.data().equals(data1));
  packet.addData(data2);
  test.strictEqual(packet.length(), 8 + allData.length);
  test.ok(packet.data().equals(allData));
  return test.done();
};

exports.createFromBuffer = function(test) {
  var buffer, packet;
  buffer = new Buffer([TYPE.PRELOGIN, 0x01, 0x00, 0x0A, 0, 0, 0, 0, 0x01, 0xFF]);
  packet = new Packet(buffer);
  test.strictEqual(packet.length(), 0x0A);
  test.ok(packet.isLast());
  test.ok(packet.data().equals(new Buffer([0x01, 0xFF])));
  return test.done();
};

exports.headerToString = function(test) {
  var buffer, expectedText, packet;
  buffer = new Buffer([TYPE.PRELOGIN, 0x03, 0x00, 0x0A, 0, 1, 2, 3, 0x01, 0xFF]);
  packet = new Packet(buffer);
  expectedText = '--type:0x12(PRELOGIN), status:0x03(EOM IGNORE), length:0x000A, spid:0x0001, packetId:0x02, window:0x03';
  test.strictEqual(packet.headerToString('--'), expectedText);
  return test.done();
};

exports.dataToStringShort = function(test) {
  var data, expectedText, packet;
  data = new Buffer([0x01, 0x02, 0x03]);
  packet = new Packet(TYPE.PRELOGIN);
  packet.addData(data);
  expectedText = '--0000  010203  ...';
  test.strictEqual(packet.dataToString('--'), expectedText);
  return test.done();
};

exports.dataExactLinesWorth = function(test) {
  var dataLine1a, dataLine1b, dataLine2a, dataLine2b, expectedText, expectedTextLine1a, expectedTextLine1b, expectedTextLine1c, packet;
  dataLine1a = new Buffer([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  dataLine1b = new Buffer([0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F]);
  dataLine2a = new Buffer([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]);
  dataLine2b = new Buffer([0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F]);
  packet = new Packet(TYPE.PRELOGIN);
  packet.addData(dataLine1a);
  packet.addData(dataLine1b);
  packet.addData(dataLine2a);
  packet.addData(dataLine2b);
  expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F';
  expectedTextLine1b = ' 10111213 14151617 18191A1B 1C1D1E1F';
  expectedTextLine1c = '  ........ ........ ........ ........';
  expectedText = expectedTextLine1a + expectedTextLine1b + expectedTextLine1c;
  test.strictEqual(packet.dataToString('--'), expectedText);
  return test.done();
};

exports.dataToStringMultipleLines = function(test) {
  var dataLine1a, dataLine1b, dataLine2a, dataLine2b, dataLine3a, expectedText, expectedTextLine1a, expectedTextLine1b, expectedTextLine1c, expectedTextLine2a, expectedTextLine2b, packet;
  dataLine1a = new Buffer([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  dataLine1b = new Buffer([0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F]);
  dataLine2a = new Buffer([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]);
  dataLine2b = new Buffer([0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F]);
  dataLine3a = new Buffer([0x30, 0x31, 0x32]);
  packet = new Packet(TYPE.PRELOGIN);
  packet.addData(dataLine1a);
  packet.addData(dataLine1b);
  packet.addData(dataLine2a);
  packet.addData(dataLine2b);
  packet.addData(dataLine3a);
  expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F';
  expectedTextLine1b = ' 10111213 14151617 18191A1B 1C1D1E1F';
  expectedTextLine1c = '  ........ ........ ........ ........\n';
  expectedTextLine2a = '--0020  303132';
  expectedTextLine2b = '  012';
  expectedText = expectedTextLine1a + expectedTextLine1b + expectedTextLine1c + expectedTextLine2a + expectedTextLine2b;
  test.strictEqual(packet.dataToString('--'), expectedText);
  return test.done();
};

exports.packetCompleteShorterThanHeader = function(test) {
  var buffer;
  buffer = new Buffer(7);
  test.ok(!isPacketComplete(buffer));
  return test.done();
};

exports.packetCompleteJustHeader = function(test) {
  var buffer;
  buffer = new Packet(TYPE.PRELOGIN).buffer;
  test.ok(isPacketComplete(buffer));
  return test.done();
};

exports.packetCompleteTooShort = function(test) {
  var buffer;
  buffer = new Buffer([0x00, 0x00, 0x00, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  test.ok(!isPacketComplete(buffer));
  return test.done();
};

exports.packetCompleteLongEnough = function(test) {
  var buffer;
  buffer = new Buffer([0x00, 0x00, 0x00, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  test.ok(isPacketComplete(buffer));
  return test.done();
};
