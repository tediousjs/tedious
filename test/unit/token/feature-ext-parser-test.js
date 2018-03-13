
var Parser = require('../../../src/token/stream-parser');
var WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');

module.exports.fedauth = function(test) {
  var buffer = new WritableTrackingBuffer(50, 'ucs2');
  const featureId = 0x02;
  const featureAckDataLen = 0;

  buffer.writeUInt8(0xAE); // FEATUREEXTACK token header
  buffer.writeUInt8(featureId);
  buffer.writeUInt32LE(featureAckDataLen);
  buffer.writeBuffer(new Buffer(0));
  buffer.writeUInt8(0xFF); // terminator

  var parser = new Parser({token() {}}, {}, {});
  parser.write(buffer.data);

  var token = parser.read();

  test.strictEqual(token.featureId, featureId);
  test.strictEqual(token.featureAckDataLen, featureAckDataLen);

  test.done();
};
