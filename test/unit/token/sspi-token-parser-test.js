var Parser = require('../../../src/token/stream-parser');
var WriteBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');

exports.parseChallengeSSPI = function(test) {
  var anyData = new Buffer([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  var source = new WriteBuffer(68);
  source.writeUInt8(0xED);
  source.writeUInt16LE(anyData.length);
  source.copyFrom(anyData);
  var parser = new Parser({ token() {} }, {}, {});
  parser.write(source.data);
  var challenge = parser.read();

  test.deepEqual(challenge.buffer, anyData);

  test.done();
};
