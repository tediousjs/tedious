var Parser = require('../../../src/token/stream-parser');
var WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');

module.exports.fedauth = function(test) {
  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xAE); // FEATUREEXTACK token header

  buffer.writeUInt8(0x01);
  buffer.writeUInt32LE(1);
  buffer.writeBuffer(Buffer.from('a'));

  buffer.writeUInt8(0x02);
  buffer.writeUInt32LE(2);
  buffer.writeBuffer(Buffer.from('bc'));

  buffer.writeUInt8(0x03);
  buffer.writeUInt32LE(0);
  buffer.writeBuffer(Buffer.from(''));

  buffer.writeUInt8(0xFF); // terminator

  var parser = new Parser({ token() {} }, {}, {});
  parser.write(buffer.data);

  var token = parser.read();

  test.ok(token.fedAuth.equals(Buffer.from('bc')));

  test.done();
};
