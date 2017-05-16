var Parser = require('../../../src/token/stream-parser');
var WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer')
  .WritableTrackingBuffer;

module.exports.oneColumn = function(test) {
  var numberOfColumns = 1;
  var length = numberOfColumns * 2;
  var column = 3;

  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xa9);
  buffer.writeUInt16LE(length);
  buffer.writeUInt16LE(column);
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, {}, { tdsVersion: '7_2' });
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.orderColumns.length, 1);
  test.strictEqual(token.orderColumns[0], column);

  test.done();
};

module.exports.twoColumns = function(test) {
  var numberOfColumns = 2;
  var length = numberOfColumns * 2;
  var column1 = 3;
  var column2 = 4;

  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xa9);
  buffer.writeUInt16LE(length);
  buffer.writeUInt16LE(column1);
  buffer.writeUInt16LE(column2);
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, {}, { tdsVersion: '7_2' });
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.orderColumns.length, 2);
  test.strictEqual(token.orderColumns[0], column1);
  test.strictEqual(token.orderColumns[1], column2);

  test.done();
};
