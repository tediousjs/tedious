'use strict';

var Parser, WritableTrackingBuffer;

Parser = require('../../../src/token/stream-parser');

WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer;

module.exports.database = function(test) {
  var buffer, data, newDb, oldDb, parser, token;
  oldDb = 'old';
  newDb = 'new';
  buffer = new WritableTrackingBuffer(50, 'ucs2');
  buffer.writeUInt8(0xE3);
  buffer.writeUInt16LE(0);
  buffer.writeUInt8(0x01);
  buffer.writeBVarchar(newDb);
  buffer.writeBVarchar(oldDb);
  data = buffer.data;
  data.writeUInt16LE(data.length - 3, 1);
  parser = new Parser({
    token: function() {}
  }, {}, {});
  parser.write(data);
  token = parser.read();
  test.strictEqual(token.type, 'DATABASE');
  test.strictEqual(token.oldValue, 'old');
  test.strictEqual(token.newValue, 'new');
  return test.done();
};

module.exports.packetSize = function(test) {
  var buffer, data, newSize, oldSize, parser, token;
  oldSize = '1024';
  newSize = '2048';
  buffer = new WritableTrackingBuffer(50, 'ucs2');
  buffer.writeUInt8(0xE3);
  buffer.writeUInt16LE(0);
  buffer.writeUInt8(0x04);
  buffer.writeBVarchar(newSize);
  buffer.writeBVarchar(oldSize);
  data = buffer.data;
  data.writeUInt16LE(data.length - 3, 1);
  parser = new Parser({
    token: function() {}
  }, {}, {});
  parser.write(data);
  token = parser.read();
  test.strictEqual(token.type, 'PACKET_SIZE');
  test.strictEqual(token.oldValue, 1024);
  test.strictEqual(token.newValue, 2048);
  return test.done();
};

module.exports.badType = function(test) {
  var buffer, data, parser, token;
  buffer = new WritableTrackingBuffer(50, 'ucs2');
  buffer.writeUInt8(0xE3);
  buffer.writeUInt16LE(0);
  buffer.writeUInt8(0xFF);
  data = buffer.data;
  data.writeUInt16LE(data.length - 3, 1);
  parser = new Parser({
    token: function() {}
  }, {}, {});
  parser.write(data);
  token = parser.read();
  test.strictEqual(token, null);
  return test.done();
};
