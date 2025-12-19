import StreamParser from '../../../src/token/stream-parser';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

describe('Fedauth Info Parser', () => {
  it('should contain fed auth info', async () => {
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

    const parser = StreamParser.parseTokens([buffer.data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.strictEqual(token.stsurl, 'stsurl');
    assert.strictEqual(token.spn, 'spn');

    assert.isTrue((await parser.next()).done);
  });
});
