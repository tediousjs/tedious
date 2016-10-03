'use strict';

var Parser, WritableTrackingBuffer, parse;

Parser = require('../../../src/token/stream-parser');

WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer;

parse = function(status, curCmd, doneRowCount) {
  var buffer, doneRowCountHi, doneRowCountLow, parser;
  doneRowCountLow = doneRowCount % 0x100000000;
  doneRowCountHi = ~~(doneRowCount / 0x100000000);
  buffer = new WritableTrackingBuffer(50, 'ucs2');
  buffer.writeUInt8(0xFD);
  buffer.writeUInt16LE(status);
  buffer.writeUInt16LE(curCmd);
  buffer.writeUInt32LE(doneRowCountLow);
  buffer.writeUInt32LE(doneRowCountHi);
  parser = new Parser({
    token: function() {}
  }, {}, {
    tdsVersion: '7_2'
  });
  parser.write(buffer.data);
  return parser.read();
};

module.exports.done = function(test) {
  var curCmd, doneRowCount, status, token;
  status = 0x0000;
  curCmd = 1;
  doneRowCount = 2;
  token = parse(status, curCmd, doneRowCount);
  test.ok(!token.more);
  test.strictEqual(token.curCmd, curCmd);
  test.ok(!token.rowCount);
  return test.done();
};

module.exports.more = function(test) {
  var curCmd, doneRowCount, status, token;
  status = 0x0001;
  curCmd = 1;
  doneRowCount = 2;
  token = parse(status, curCmd, doneRowCount);
  test.ok(token.more);
  test.strictEqual(token.curCmd, curCmd);
  test.ok(!token.rowCount);
  return test.done();
};

module.exports.doneRowCount = function(test) {
  var curCmd, doneRowCount, status, token;
  status = 0x0010;
  curCmd = 1;
  doneRowCount = 0x1200000034;
  token = parse(status, curCmd, doneRowCount);
  test.ok(!token.more);
  test.strictEqual(token.curCmd, 1);
  test.strictEqual(token.rowCount, doneRowCount);
  return test.done();
};
