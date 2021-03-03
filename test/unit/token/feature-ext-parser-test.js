const StreamParser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Feature Ext Praser', () => {
  it('should be fed authentication', async () => {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header

    buffer.writeUInt8(0x01);
    buffer.writeUInt32LE(1);
    buffer.writeBuffer(Buffer.from('a'));

    buffer.writeUInt8(0x02);
    buffer.writeUInt32LE(2);
    buffer.writeBuffer(Buffer.from('bc'));

    buffer.writeUInt8(0x03);
    buffer.writeUInt32LE(0);
    buffer.writeBuffer(Buffer.from(''));

    buffer.writeUInt8(0xFF); // terminator

    const parser = StreamParser.parseTokens([buffer.data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.isOk(token.fedAuth.equals(Buffer.from('bc')));
    assert.isTrue((await parser.next()).done);
  });
});
