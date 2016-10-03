'use strict';

var Parser, WritableTrackingBuffer;

Parser = require('../../../src/token/stream-parser');

WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer;

module.exports.info = function(test) {
  var buffer, data, interfaceType, parser, progName, progVersion, token, version;
  interfaceType = 1;
  version = 0x72090002;
  progName = 'prog';
  progVersion = {
    major: 1,
    minor: 2,
    buildNumHi: 3,
    buildNumLow: 4
  };
  buffer = new WritableTrackingBuffer(50, 'ucs2');
  buffer.writeUInt8(0xAD);
  buffer.writeUInt16LE(0);
  buffer.writeUInt8(interfaceType);
  buffer.writeUInt32BE(version);
  buffer.writeBVarchar(progName);
  buffer.writeUInt8(progVersion.major);
  buffer.writeUInt8(progVersion.minor);
  buffer.writeUInt8(progVersion.buildNumHi);
  buffer.writeUInt8(progVersion.buildNumLow);
  data = buffer.data;
  data.writeUInt16LE(data.length - 3, 1);
  parser = new Parser({
    token: function() {}
  }, {}, {
    tdsVersion: '7_2'
  });
  parser.write(data);
  token = parser.read();
  test.strictEqual(token['interface'], 'SQL_TSQL');
  test.strictEqual(token.tdsVersion, '7_2');
  test.strictEqual(token.progName, progName);
  test.deepEqual(token.progVersion, progVersion);
  return test.done();
};
