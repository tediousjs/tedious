import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { DatabaseEnvChangeToken, PacketSizeEnvChangeToken } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

describe('Env Change Token Parser', () => {
  it('should parse database change', async function() {
    const oldDb = 'old';
    const newDb = 'new';

    const buffer = new WritableTrackingBuffer();

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0x01); // Database
    buffer.writeBVarchar(newDb, 'ucs2');
    buffer.writeBVarchar(oldDb, 'ucs2');

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = StreamParser.parseTokens([data], options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, DatabaseEnvChangeToken);
    assert.strictEqual(token.type, 'DATABASE');
    assert.strictEqual(token.oldValue, 'old');
    assert.strictEqual(token.newValue, 'new');
  });

  it('should parse packet size change', async function() {
    const oldSize = '1024';
    const newSize = '2048';

    const buffer = new WritableTrackingBuffer();

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0x04); // Packet size
    buffer.writeBVarchar(newSize, 'ucs2');
    buffer.writeBVarchar(oldSize, 'ucs2');

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = StreamParser.parseTokens([data], options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, PacketSizeEnvChangeToken);
    assert.strictEqual(token.type, 'PACKET_SIZE');
    assert.strictEqual(token.oldValue, 1024);
    assert.strictEqual(token.newValue, 2048);
  });

  function buildPacketSizeChange(newSize: string, oldSize = '4096') {
    const buffer = new WritableTrackingBuffer();

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0x04); // Packet size
    buffer.writeBVarchar(newSize, 'ucs2');
    buffer.writeBVarchar(oldSize, 'ucs2');

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);
    return data;
  }

  for (const newSize of ['512', '32767']) {
    it(`accepts a packet size change to ${newSize}`, async function() {
      const parser = StreamParser.parseTokens([buildPacketSizeChange(newSize)], options);
      const result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.instanceOf(token, PacketSizeEnvChangeToken);
      assert.strictEqual(token.newValue, Number(newSize));
    });
  }

  for (const newSize of ['8', '0', '-1', '511', '32768', '', 'abc', '4096abc', '1024.5']) {
    it(`rejects a packet size change to ${JSON.stringify(newSize)}`, async function() {
      const parser = StreamParser.parseTokens([buildPacketSizeChange(newSize)], options);

      let error: Error | undefined;
      try {
        await parser.next();
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, Error);
      assert.match(error!.message, /Server sent an invalid packet size/);
    });
  }

  it('should skip unknown env change types', async function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0xff); // Bad type

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = StreamParser.parseTokens([data], options);
    const result = await parser.next();

    assert.isTrue(result.done);
    assert.isUndefined(result.value);
  });
});
