'use strict';

var Parser, WritableTrackingBuffer;

Parser = require('../../../src/token/stream-parser');

WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer;

module.exports.oneColumn = function(test) {
  var buffer, column, length, numberOfColumns, parser, token;
  numberOfColumns = 1;
  length = numberOfColumns * 2;
  column = 3;
  buffer = new WritableTrackingBuffer(50, 'ucs2');
  buffer.writeUInt8(0xA9);
  buffer.writeUInt16LE(length);
  buffer.writeUInt16LE(column);
  parser = new Parser({
    token: function() {}
  }, {}, {
    tdsVersion: '7_2'
  });
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.orderColumns.length, 1);
  test.strictEqual(token.orderColumns[0], column);
  return test.done();
};

module.exports.twoColumns = function(test) {
  var buffer, column1, column2, length, numberOfColumns, parser, token;
  numberOfColumns = 2;
  length = numberOfColumns * 2;
  column1 = 3;
  column2 = 4;
  buffer = new WritableTrackingBuffer(50, 'ucs2');
  buffer.writeUInt8(0xA9);
  buffer.writeUInt16LE(length);
  buffer.writeUInt16LE(column1);
  buffer.writeUInt16LE(column2);
  parser = new Parser({
    token: function() {}
  }, {}, {
    tdsVersion: '7_2'
  });
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.orderColumns.length, 2);
  test.strictEqual(token.orderColumns[0], column1);
  test.strictEqual(token.orderColumns[1], column2);
  return test.done();
};
