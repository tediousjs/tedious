import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { DatabaseEnvChangeToken, PacketSizeEnvChangeToken } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';
import { assert } from 'chai';

const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

describe('Env Change Token Parser', () => {
  it('should parse database change', async function() {
    const debug = new Debug();
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

    assert.instanceOf(token, DatabaseEnvChangeToken);
    assert.strictEqual(token.type, 'DATABASE');
    assert.strictEqual(token.oldValue, 'old');
    assert.strictEqual(token.newValue, 'new');
  });

  it('should parse packet size change', async function() {
    const debug = new Debug();
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

    assert.instanceOf(token, PacketSizeEnvChangeToken);
    assert.strictEqual(token.type, 'PACKET_SIZE');
    assert.strictEqual(token.oldValue, 1024);
    assert.strictEqual(token.newValue, 2048);
  });

  it('should skip unknown env change types', async function() {
    const debug = new Debug();
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
