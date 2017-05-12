var Parser = require('../../../src/token/stream-parser');
var WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer')
  .WritableTrackingBuffer;

module.exports.database = function(test) {
  var oldDb = 'old';
  var newDb = 'new';

  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xe3);
  buffer.writeUInt16LE(0); // Length written later
  buffer.writeUInt8(0x01); // Database
  buffer.writeBVarchar(newDb);
  buffer.writeBVarchar(oldDb);

  var data = buffer.data;
  data.writeUInt16LE(data.length - 3, 1);

  var parser = new Parser({ token() {} }, {}, {});
  parser.write(data);
  var token = parser.read();

  test.strictEqual(token.type, 'DATABASE');
  test.strictEqual(token.oldValue, 'old');
  test.strictEqual(token.newValue, 'new');

  test.done();
};

module.exports.packetSize = function(test) {
  var oldSize = '1024';
  var newSize = '2048';

  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xe3);
  buffer.writeUInt16LE(0); // Length written later
  buffer.writeUInt8(0x04); // Packet size
  buffer.writeBVarchar(newSize);
  buffer.writeBVarchar(oldSize);

  var data = buffer.data;
  data.writeUInt16LE(data.length - 3, 1);

  var parser = new Parser({ token() {} }, {}, {});
  parser.write(data);
  var token = parser.read();

  test.strictEqual(token.type, 'PACKET_SIZE');
  test.strictEqual(token.oldValue, 1024);
  test.strictEqual(token.newValue, 2048);

  test.done();
};

module.exports.badType = function(test) {
  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xe3);
  buffer.writeUInt16LE(0); // Length written later
  buffer.writeUInt8(0xff); // Bad type

  var data = buffer.data;
  data.writeUInt16LE(data.length - 3, 1);

  var parser = new Parser({ token() {} }, {}, {});
  parser.write(data);
  var token = parser.read();

  test.strictEqual(token, null);
  test.done();
};
