const StreamParser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Feature Ext Parser', () => {
  it('should be fed authentication', async () => {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header

    buffer.writeUInt8(0x01); // SESSIONRECOVERY
    buffer.writeUInt32LE(1);
    buffer.writeBuffer(Buffer.from('a'));

    buffer.writeUInt8(0x02); // FEDAUTH
    buffer.writeUInt32LE(2);
    buffer.writeBuffer(Buffer.from('bc'));

    buffer.writeUInt8(0x03); // made-up feature ext
    buffer.writeUInt32LE(0);
    buffer.writeBuffer(Buffer.from(''));

    buffer.writeUInt8(0xFF); // terminator

    const parser = StreamParser.parseTokens([buffer.data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.isOk(token.fedAuth.equals(Buffer.from('bc')));
    assert.isUndefined(token.utf8Support); // feature ext ack for UTF8_SUPPORT was not received
    assert.isTrue((await parser.next()).done);
  });

  it('should parse UTF-8 support token', async () => {
    const buffer = new WritableTrackingBuffer(8);

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header
    buffer.writeUInt8(0x0A); // UTF8_SUPPORT feature id
    buffer.writeUInt32LE(0x00_00_00_01); // datalen
    buffer.writeUInt8(0x01); // supported

    buffer.writeUInt8(0xFF); // TERMINATOR

    const parser = StreamParser.parseTokens([buffer.data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);

    const token = result.value;
    assert.strictEqual(token.utf8Support, true); // feature ext ack for UTF8_SUPPORT was positive
    assert.isUndefined(token.fedAuth); // fed auth not ack'd

    assert.isTrue((await parser.next()).done);
  });

  it('should parse column encryption token', async () => {
    const buffer = new WritableTrackingBuffer(8);

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header
    buffer.writeUInt8(0x04); // COLUMNENCRYPTION feature id
    buffer.writeUInt32LE(0x00_00_00_01); // datalen
    buffer.writeUInt8(0x01); // supported

    buffer.writeUInt8(0xFF); // TERMINATOR

    const parser = StreamParser.parseTokens([buffer.data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);

    const token = result.value;
    assert.strictEqual(token.columnEncryption, true); // feature ext ack for COLUMNENCRYPTION was positive
    assert.isUndefined(token.fedAuth); // fed auth not ack'd

    assert.isTrue((await parser.next()).done);
  });

  it('should return error for non support cryptographic protocol version', async () => {
    const buffer = new WritableTrackingBuffer(8);

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header
    buffer.writeUInt8(0x04); // COLUMNENCRYPTION feature id
    buffer.writeUInt32LE(0x00_00_00_01); // datalen
    buffer.writeUInt8(0x02); // supported

    buffer.writeUInt8(0xFF); // TERMINATOR
    let error;
    try {
      const parser = StreamParser.parseTokens([buffer.data], {}, {});
      await parser.next();
    } catch (err) {
      error = err;
    }
    assert.instanceOf(error, Error);
    assert.include(error.message, 'Unsupported supported cryptographic protocol version');
  });
});
