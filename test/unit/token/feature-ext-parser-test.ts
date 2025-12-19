import StreamParser from '../../../src/token/stream-parser';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

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

    const parser = StreamParser.parseTokens([buffer.data], {} as any, {} as any);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.isOk((token as any).fedAuth.equals(Buffer.from('bc')));
    assert.isUndefined((token as any).utf8Support); // feature ext ack for UTF8_SUPPORT was not received
    assert.isTrue((await parser.next()).done);
  });

  it('should parse UTF-8 support token', async () => {
    const buffer = new WritableTrackingBuffer(8);

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header
    buffer.writeUInt8(0x0A); // UTF8_SUPPORT feature id
    buffer.writeUInt32LE(0x00_00_00_01); // datalen
    buffer.writeUInt8(0x01); // supported

    buffer.writeUInt8(0xFF); // TERMINATOR

    const parser = StreamParser.parseTokens([buffer.data], {} as any, {} as any);
    const result = await parser.next();
    assert.isFalse(result.done);

    const token = result.value;
    assert.strictEqual((token as any).utf8Support, true); // feature ext ack for UTF8_SUPPORT was positive
    assert.isUndefined((token as any).fedAuth); // fed auth not ack'd

    assert.isTrue((await parser.next()).done);
  });
});
