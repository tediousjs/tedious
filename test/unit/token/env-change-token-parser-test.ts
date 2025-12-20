import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { type EnvChangeToken } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';
import { assert } from 'chai';

const debug = new Debug();
const options: ParserOptions = { tdsVersion: '7_2', useUTC: false };

describe('Env Change Token Parser', () => {
  it('should write to database', async () => {
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

    const parser = StreamParser.parseTokens([data], debug, options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.strictEqual((token as EnvChangeToken).type, 'DATABASE');
    assert.strictEqual((token as EnvChangeToken).oldValue, 'old');
    assert.strictEqual((token as EnvChangeToken).newValue, 'new');
  });

  it('should write with correct packet size', async () => {
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

    const parser = StreamParser.parseTokens([data], debug, options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual((token as EnvChangeToken).type, 'PACKET_SIZE');
    assert.strictEqual((token as EnvChangeToken).oldValue, 1024);
    assert.strictEqual((token as EnvChangeToken).newValue, 2048);
  });

  it('should be of bad type', async () => {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0xff); // Bad type

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = StreamParser.parseTokens([data], debug, options);
    const result = await parser.next();

    assert.isTrue(result.done);
    assert.isUndefined(result.value);
  });
});
