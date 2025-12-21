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

  it('should parse COLUMNENCRYPTION acknowledgment', async () => {
    const buffer = new WritableTrackingBuffer(8);

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header
    buffer.writeUInt8(0x04); // COLUMNENCRYPTION feature id
    buffer.writeUInt32LE(0x00_00_00_01); // datalen = 1
    buffer.writeUInt8(0x01); // version 1

    buffer.writeUInt8(0xFF); // TERMINATOR

    const parser = StreamParser.parseTokens([buffer.data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);

    const token = result.value;
    assert.strictEqual(token.columnEncryption, true); // COLUMNENCRYPTION was acknowledged
    assert.isUndefined(token.fedAuth);
    assert.isUndefined(token.utf8Support);

    assert.isTrue((await parser.next()).done);
  });

  it('should parse COLUMNENCRYPTION with zero-length data as false', async () => {
    const buffer = new WritableTrackingBuffer(8);

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header
    buffer.writeUInt8(0x04); // COLUMNENCRYPTION feature id
    buffer.writeUInt32LE(0x00_00_00_00); // datalen = 0 (not supported)

    buffer.writeUInt8(0xFF); // TERMINATOR

    const parser = StreamParser.parseTokens([buffer.data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);

    const token = result.value;
    assert.strictEqual(token.columnEncryption, false); // COLUMNENCRYPTION not supported

    assert.isTrue((await parser.next()).done);
  });

  it('should parse multiple features including COLUMNENCRYPTION', async () => {
    const buffer = new WritableTrackingBuffer(32);

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header

    // COLUMNENCRYPTION feature
    buffer.writeUInt8(0x04); // COLUMNENCRYPTION feature id
    buffer.writeUInt32LE(0x00_00_00_01); // datalen = 1
    buffer.writeUInt8(0x01); // version 1

    // UTF8_SUPPORT feature
    buffer.writeUInt8(0x0A); // UTF8_SUPPORT feature id
    buffer.writeUInt32LE(0x00_00_00_01); // datalen = 1
    buffer.writeUInt8(0x01); // supported

    // FEDAUTH feature
    buffer.writeUInt8(0x02); // FEDAUTH
    buffer.writeUInt32LE(2);
    buffer.writeBuffer(Buffer.from('ab'));

    buffer.writeUInt8(0xFF); // TERMINATOR

    const parser = StreamParser.parseTokens([buffer.data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);

    const token = result.value;
    assert.strictEqual(token.columnEncryption, true);
    assert.strictEqual(token.utf8Support, true);
    assert.isOk(token.fedAuth.equals(Buffer.from('ab')));

    assert.isTrue((await parser.next()).done);
  });
});
