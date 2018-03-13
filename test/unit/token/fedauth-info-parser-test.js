const Parser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');

module.exports.fedauthInfo = function(test) {
  const buffer = new WritableTrackingBuffer(50, 'ucs-2');
  buffer.writeUInt8('0xEE');
  buffer.writeUInt32LE(40);
  buffer.writeUInt32LE(2);
  buffer.writeUInt8(2);
  buffer.writeUInt32LE(6);
  buffer.writeUInt32LE(22);
  buffer.writeUInt8(1);
  buffer.writeUInt32LE(12);
  buffer.writeUInt32LE(28);
  buffer.writeString('spn');
  buffer.writeString('stsurl');

  const parser = new Parser({ token() {} }, {}, {});
  parser.write(buffer.data);
  const token = parser.read();

  test.strictEqual(token.fedAuthInfoData.stsurl, 'stsurl');
  test.strictEqual(token.fedAuthInfoData.spn, 'spn');

  test.done();
};
