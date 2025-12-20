import { typeByName } from '../../../src/data-type';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { ColMetadataToken } from '../../../src/token/token';
import Debug from '../../../src/debug';
import { assert } from 'chai';

const debug = new Debug();
const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

describe('Colmetadata Token Parser', () => {
  describe('parsing the column metadata for a result with many columns', function() {
    it('should parse them correctly', async function() {
      const userType = 2;
      const flags = 3;
      const columnName = 'name';

      const buffer = new WritableTrackingBuffer(50, 'ucs2');

      buffer.writeUInt8(0x81);
      // Column Count
      buffer.writeUInt16LE(1024);

      for (let i = 0; i < 1024; i++) {
        buffer.writeUInt32LE(userType);
        buffer.writeUInt16LE(flags);
        buffer.writeUInt8(typeByName.Int.id);
        buffer.writeBVarchar(columnName);
      }

      const parser = StreamParser.parseTokens([buffer.data], debug, options);

      const result = await parser.next();
      assert.isFalse(result.done);
      const token = result.value;

      assert.instanceOf(token, ColMetadataToken);
      assert.strictEqual(token.columns.length, 1024);

      for (let i = 0; i < 1024; i++) {
        assert.strictEqual(token.columns[i].userType, 2);
        assert.strictEqual(token.columns[i].flags, 3);
        assert.strictEqual(token.columns[i].type.name, 'Int');
        assert.strictEqual(token.columns[i].colName, 'name');
      }

      assert.isTrue((await parser.next()).done);
    });
  });

  it('should int', async () => {
    const numberOfColumns = 1;
    const userType = 2;
    const flags = 3;
    const columnName = 'name';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0x81);
    buffer.writeUInt16LE(numberOfColumns);
    buffer.writeUInt32LE(userType);
    buffer.writeUInt16LE(flags);
    buffer.writeUInt8(typeByName.Int.id);
    buffer.writeBVarchar(columnName);
    // console.log(buffer.data)

    const parser = StreamParser.parseTokens([buffer.data], debug, options);

    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, ColMetadataToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].userType, 2);
    assert.strictEqual(token.columns[0].flags, 3);
    assert.strictEqual(token.columns[0].type.name, 'Int');
    assert.strictEqual(token.columns[0].colName, 'name');

    assert.isTrue((await parser.next()).done);
  });

  it('should varchar', async () => {
    const numberOfColumns = 1;
    const userType = 2;
    const flags = 3;
    const length = 3;
    const collation = Buffer.from([0x09, 0x04, 0x50, 0x78, 0x9a]);
    const columnName = 'name';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0x81);
    buffer.writeUInt16LE(numberOfColumns);
    buffer.writeUInt32LE(userType);
    buffer.writeUInt16LE(flags);
    buffer.writeUInt8(typeByName.VarChar.id);
    buffer.writeUInt16LE(length);
    buffer.writeBuffer(collation);
    buffer.writeBVarchar(columnName);
    // console.log(buffer)


    const parser = StreamParser.parseTokens([buffer.data], debug, options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, ColMetadataToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].userType, 2);
    assert.strictEqual(token.columns[0].flags, 3);
    assert.strictEqual(token.columns[0].type.name, 'VarChar');
    assert.strictEqual(token.columns[0].collation!.lcid, 0x0409);
    assert.strictEqual(token.columns[0].collation!.codepage, 'CP1257');
    assert.strictEqual(token.columns[0].collation!.flags, 0x85);
    assert.strictEqual(token.columns[0].collation!.version, 0x7);
    assert.strictEqual(token.columns[0].collation!.sortId, 0x9a);
    assert.strictEqual(token.columns[0].colName, 'name');
    assert.strictEqual(token.columns[0].dataLength, length);
  });
});
