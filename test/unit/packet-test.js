var Packet = require('../../src/packet').Packet;
var TYPE = require('../../src/packet').TYPE;
var isPacketComplete = require('../../src/packet').isPacketComplete;

exports.createEmpty = function(test) {
  var packet = new Packet(TYPE.PRELOGIN);

  test.ok(packet);
  test.ok(
    packet.buffer.equals(Buffer.from([TYPE.PRELOGIN, 0, 0, 8, 0, 0, 1, 0]))
  );

  test.done();
};

exports.last = function(test) {
  var packet = new Packet(TYPE.PRELOGIN);
  test.ok(!packet.isLast());

  packet = new Packet(TYPE.PRELOGIN);
  test.ok(!packet.last());
  packet.last(true);
  test.ok(packet.last());

  test.done();
};

exports.packetId = function(test) {
  var packet = new Packet(TYPE.PRELOGIN);
  test.strictEqual(packet.packetId(), 1);

  packet.packetId(2);
  test.strictEqual(packet.packetId(), 2);

  test.done();
};

exports.data = function(test) {
  var data1 = Buffer.from([0x01, 0x02, 0x03]);
  var data2 = Buffer.from([0xff, 0xfe]);
  var allData = Buffer.concat([data1, data2]);

  var packet = new Packet(TYPE.PRELOGIN);
  test.strictEqual(packet.length(), 8);
  test.ok(packet.data().equals(Buffer.alloc(0)));

  packet.addData(data1);
  test.strictEqual(packet.length(), 8 + data1.length);
  test.ok(packet.data().equals(data1));

  packet.addData(data2);
  test.strictEqual(packet.length(), 8 + allData.length);
  test.ok(packet.data().equals(allData));

  test.done();
};

exports.createFromBuffer = function(test) {
  var buffer = Buffer.from([
    TYPE.PRELOGIN,
    0x01,
    0x00,
    0x0a,
    0,
    0,
    0,
    0,
    0x01,
    0xff
  ]);
  var packet = new Packet(buffer);

  test.strictEqual(packet.length(), 0x0a);
  test.ok(packet.isLast());
  test.ok(packet.data().equals(Buffer.from([0x01, 0xff])));

  test.done();
};

exports.headerToString = function(test) {
  var buffer = Buffer.from([
    TYPE.PRELOGIN,
    0x03,
    0x00,
    0x0a,
    0,
    1,
    2,
    3,
    0x01,
    0xff
  ]);
  var packet = new Packet(buffer);

  var expectedText =
    '--type:0x12(PRELOGIN), status:0x03(EOM IGNORE), length:0x000A, spid:0x0001, packetId:0x02, window:0x03';
  test.strictEqual(packet.headerToString('--'), expectedText);

  test.done();
};

exports.dataToStringShort = function(test) {
  var data = Buffer.from([0x01, 0x02, 0x03]);

  var packet = new Packet(TYPE.PRELOGIN);
  packet.addData(data);

  var expectedText = '--0000  010203  ...';
  test.strictEqual(packet.dataToString('--'), expectedText);

  test.done();
};

exports.dataExactLinesWorth = function(test) {
  var dataLine1a = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  var dataLine1b = Buffer.from([0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
  var dataLine2a = Buffer.from([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]);
  var dataLine2b = Buffer.from([0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f]);

  var packet = new Packet(TYPE.PRELOGIN);
  packet.addData(dataLine1a);
  packet.addData(dataLine1b);
  packet.addData(dataLine2a);
  packet.addData(dataLine2b);

  var expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F';
  var expectedTextLine1b = ' 10111213 14151617 18191A1B 1C1D1E1F';
  var expectedTextLine1c = '  ........ ........ ........ ........';
  var expectedText =
    expectedTextLine1a + expectedTextLine1b + expectedTextLine1c;
  test.strictEqual(packet.dataToString('--'), expectedText);

  test.done();
};

exports.dataToStringMultipleLines = function(test) {
  var dataLine1a = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  var dataLine1b = Buffer.from([0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
  var dataLine2a = Buffer.from([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]);
  var dataLine2b = Buffer.from([0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f]);
  var dataLine3a = Buffer.from([0x30, 0x31, 0x32]);

  var packet = new Packet(TYPE.PRELOGIN);
  packet.addData(dataLine1a);
  packet.addData(dataLine1b);
  packet.addData(dataLine2a);
  packet.addData(dataLine2b);
  packet.addData(dataLine3a);

  var expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F';
  var expectedTextLine1b = ' 10111213 14151617 18191A1B 1C1D1E1F';
  var expectedTextLine1c = '  ........ ........ ........ ........\n';
  var expectedTextLine2a = '--0020  303132';
  var expectedTextLine2b = '  012';
  var expectedText =
    expectedTextLine1a +
    expectedTextLine1b +
    expectedTextLine1c +
    expectedTextLine2a +
    expectedTextLine2b;
  test.strictEqual(packet.dataToString('--'), expectedText);

  test.done();
};

exports.packetCompleteShorterThanHeader = function(test) {
  var buffer = Buffer.alloc(7);
  test.ok(!isPacketComplete(buffer));

  test.done();
};

exports.packetCompleteJustHeader = function(test) {
  var buffer = new Packet(TYPE.PRELOGIN).buffer;

  test.ok(isPacketComplete(buffer));

  test.done();
};

exports.packetCompleteTooShort = function(test) {
  var buffer = Buffer.from([
    0x00,
    0x00,
    0x00,
    0x0c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00
  ]);

  test.ok(!isPacketComplete(buffer));

  test.done();
};

exports.packetCompleteLongEnough = function(test) {
  var buffer = Buffer.from([
    0x00,
    0x00,
    0x00,
    0x0c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00
  ]);

  test.ok(isPacketComplete(buffer));

  test.done();
};
