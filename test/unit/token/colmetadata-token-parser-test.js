'use strict';

var TokenStreamParser, WritableTrackingBuffer, dataTypeByName, parser;

parser = require('../../../src/token/colmetadata-token-parser');

dataTypeByName = require('../../../src/data-type').typeByName;

WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer;

TokenStreamParser = require('../../../src/token/stream-parser');

module.exports.int = function(test) {
  var buffer, columnName, flags, numberOfColumns, token, userType;
  numberOfColumns = 1;
  userType = 2;
  flags = 3;
  columnName = 'name';
  buffer = new WritableTrackingBuffer(50, 'ucs2');
  buffer.writeUInt8(0x81);
  buffer.writeUInt16LE(numberOfColumns);
  buffer.writeUInt32LE(userType);
  buffer.writeUInt16LE(flags);
  buffer.writeUInt8(dataTypeByName.Int.id);
  buffer.writeBVarchar(columnName);
  parser = new TokenStreamParser({
    token: function() {}
  }, {}, {});
  parser.write(buffer.data);
  token = parser.read();
  test.ok(!token.error);
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].userType, 2);
  test.strictEqual(token.columns[0].flags, 3);
  test.strictEqual(token.columns[0].type.name, 'Int');
  test.strictEqual(token.columns[0].colName, 'name');
  return test.done();
};

module.exports.varchar = function(test) {
  var buffer, collation, columnName, flags, length, numberOfColumns, token, userType;
  numberOfColumns = 1;
  userType = 2;
  flags = 3;
  length = 3;
  collation = new Buffer([0x09, 0x04, 0x50, 0x78, 0x9a]);
  columnName = 'name';
  buffer = new WritableTrackingBuffer(50, 'ucs2');
  buffer.writeUInt8(0x81);
  buffer.writeUInt16LE(numberOfColumns);
  buffer.writeUInt32LE(userType);
  buffer.writeUInt16LE(flags);
  buffer.writeUInt8(dataTypeByName.VarChar.id);
  buffer.writeUInt16LE(length);
  buffer.writeBuffer(collation);
  buffer.writeBVarchar(columnName);
  parser = new TokenStreamParser({
    token: function() {}
  }, {}, {});
  parser.write(buffer.data);
  token = parser.read();
  test.ok(!token.error);
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].userType, 2);
  test.strictEqual(token.columns[0].flags, 3);
  test.strictEqual(token.columns[0].type.name, 'VarChar');
  test.strictEqual(token.columns[0].collation.lcid, 0x0409);
  test.strictEqual(token.columns[0].collation.codepage, 'CP1257');
  test.strictEqual(token.columns[0].collation.flags, 0x57);
  test.strictEqual(token.columns[0].collation.version, 0x8);
  test.strictEqual(token.columns[0].collation.sortId, 0x9a);
  test.strictEqual(token.columns[0].colName, 'name');
  test.strictEqual(token.columns[0].dataLength, length);
  return test.done();
};
