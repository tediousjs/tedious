const Parser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Env Change Token Parser', () => {
  it('should write to database', () => {
    const oldDb = 'old';
    const newDb = 'new';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0x01); // Database
    buffer.writeBVarchar(newDb);
    buffer.writeBVarchar(oldDb);

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = new Parser({ token() { } }, {}, {});
    parser.write(data);
    const token = parser.read();

    assert.strictEqual(token.type, 'DATABASE');
    assert.strictEqual(token.oldValue, 'old');
    assert.strictEqual(token.newValue, 'new');
  });

  it('should write with correct packet size', () => {
    const oldSize = '1024';
    const newSize = '2048';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0x04); // Packet size
    buffer.writeBVarchar(newSize);
    buffer.writeBVarchar(oldSize);

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = new Parser({ token() { } }, {}, {});
    parser.write(data);
    const token = parser.read();

    assert.strictEqual(token.type, 'PACKET_SIZE');
    assert.strictEqual(token.oldValue, 1024);
    assert.strictEqual(token.newValue, 2048);
  });

  it('should be of bad type', () => {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0xff); // Bad type

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = new Parser({ token() { } }, {}, {});
    parser.write(data);
    const token = parser.read();

    assert.strictEqual(token, null);
  });
});
