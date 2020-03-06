const Parser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Loginack Token Parser', () => {
  it('should have correct info', () => {
    const interfaceType = 1;
    const version = 0x72090002;
    const progName = 'prog';
    const progVersion = {
      major: 1,
      minor: 2,
      buildNumHi: 3,
      buildNumLow: 4
    };

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xad);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(interfaceType);
    buffer.writeUInt32BE(version);
    buffer.writeBVarchar(progName);
    buffer.writeUInt8(progVersion.major);
    buffer.writeUInt8(progVersion.minor);
    buffer.writeUInt8(progVersion.buildNumHi);
    buffer.writeUInt8(progVersion.buildNumLow);

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);
    // console.log(buffer)

    const parser = new Parser({ token() { } }, {}, { tdsVersion: '7_2' });
    parser.write(data);
    const token = parser.read();

    assert.strictEqual(token.interface, 'SQL_TSQL');
    assert.strictEqual(token.tdsVersion, '7_2');
    assert.strictEqual(token.progName, progName);
    assert.deepEqual(token.progVersion, progVersion);
  });
});
