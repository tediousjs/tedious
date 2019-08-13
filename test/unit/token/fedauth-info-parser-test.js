const Parser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Fedauth Info Parser', () => {
  it('should contain fed auth info', () => {
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

    const parser = new Parser({ token() { } }, {}, {});
    parser.write(buffer.data);
    const token = parser.read();

    assert.strictEqual(token.stsurl, 'stsurl');
    assert.strictEqual(token.spn, 'spn');
  });
});
