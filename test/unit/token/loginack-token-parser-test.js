var Parser = require('../../../src/token/stream-parser');
var WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer')
  .WritableTrackingBuffer;

module.exports.info = function(test) {
  var interfaceType = 1;
  var version = 0x72090002;
  var progName = 'prog';
  var progVersion = {
    major: 1,
    minor: 2,
    buildNumHi: 3,
    buildNumLow: 4
  };

  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xad);
  buffer.writeUInt16LE(0); // Length written later
  buffer.writeUInt8(interfaceType);
  buffer.writeUInt32BE(version);
  buffer.writeBVarchar(progName);
  buffer.writeUInt8(progVersion.major);
  buffer.writeUInt8(progVersion.minor);
  buffer.writeUInt8(progVersion.buildNumHi);
  buffer.writeUInt8(progVersion.buildNumLow);

  var data = buffer.data;
  data.writeUInt16LE(data.length - 3, 1);
  //console.log(buffer)

  var parser = new Parser({ token() {} }, {}, { tdsVersion: '7_2' });
  parser.write(data);
  var token = parser.read();

  test.strictEqual(token.interface, 'SQL_TSQL');
  test.strictEqual(token.tdsVersion, '7_2');
  test.strictEqual(token.progName, progName);
  test.deepEqual(token.progVersion, progVersion);

  return test.done();
};
