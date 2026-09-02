import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { ColInfoToken } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';
import { assert } from 'chai';

describe('ColInfo Token Parser', function() {
  const options = { tdsVersion: '7_4' } as ParserOptions;

  it('should parse a single column', async function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeUInt8(0xa5);
    buffer.writeUInt16LE(3);
    buffer.writeUInt8(1); // colNum
    buffer.writeUInt8(1); // tableNum
    buffer.writeUInt8(0x00); // status

    const parser = StreamParser.parseTokens([buffer.data], new Debug(), options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, ColInfoToken);
    assert.deepEqual(token.columns, [
      { colNum: 1, tableNum: 1, expression: false, key: false, hidden: false, colName: undefined }
    ]);

    assert.isTrue((await parser.next()).done);
  });

  it('should parse the column status flags', async function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeUInt8(0xa5);
    buffer.writeUInt16LE(3 * 3);
    buffer.writeUInt8(1);
    buffer.writeUInt8(0);
    buffer.writeUInt8(0x04); // EXPRESSION
    buffer.writeUInt8(2);
    buffer.writeUInt8(1);
    buffer.writeUInt8(0x08); // KEY
    buffer.writeUInt8(3);
    buffer.writeUInt8(1);
    buffer.writeUInt8(0x08 | 0x10); // KEY | HIDDEN

    const parser = StreamParser.parseTokens([buffer.data], new Debug(), options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, ColInfoToken);
    assert.deepEqual(token.columns, [
      { colNum: 1, tableNum: 0, expression: true, key: false, hidden: false, colName: undefined },
      { colNum: 2, tableNum: 1, expression: false, key: true, hidden: false, colName: undefined },
      { colNum: 3, tableNum: 1, expression: false, key: true, hidden: true, colName: undefined }
    ]);

    assert.isTrue((await parser.next()).done);
  });

  it('should parse the base column name for aliased columns', async function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeUInt8(0xa5);
    buffer.writeUInt16LE(3 + 1 + ('name'.length * 2) + 3);
    buffer.writeUInt8(1);
    buffer.writeUInt8(1);
    buffer.writeUInt8(0x20); // DIFFERENT_NAME
    buffer.writeBVarchar('name', 'ucs2');
    buffer.writeUInt8(2);
    buffer.writeUInt8(1);
    buffer.writeUInt8(0x00);

    const parser = StreamParser.parseTokens([buffer.data], new Debug(), options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, ColInfoToken);
    assert.deepEqual(token.columns, [
      { colNum: 1, tableNum: 1, expression: false, key: false, hidden: false, colName: 'name' },
      { colNum: 2, tableNum: 1, expression: false, key: false, hidden: false, colName: undefined }
    ]);

    assert.isTrue((await parser.next()).done);
  });

  it('should reject a token whose contents overrun its declared length', async function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeUInt8(0xa5);
    buffer.writeUInt16LE(3); // declared length only covers the fixed fields
    buffer.writeUInt8(1);
    buffer.writeUInt8(1);
    buffer.writeUInt8(0x20); // DIFFERENT_NAME
    buffer.writeBVarchar('name', 'ucs2');

    const parser = StreamParser.parseTokens([buffer.data], new Debug(), options);

    let error;
    try {
      await parser.next();
    } catch (err: any) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.message, 'Malformed COLINFO token');
  });

  it('should parse a token that arrives in single byte chunks', async function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeUInt8(0xa5);
    buffer.writeUInt16LE(3 + 1 + ('name'.length * 2));
    buffer.writeUInt8(1);
    buffer.writeUInt8(1);
    buffer.writeUInt8(0x20); // DIFFERENT_NAME
    buffer.writeBVarchar('name', 'ucs2');

    const chunks = Array.from(buffer.data, (byte) => Buffer.from([byte]));

    const parser = StreamParser.parseTokens(chunks, new Debug(), options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, ColInfoToken);
    assert.deepEqual(token.columns, [
      { colNum: 1, tableNum: 1, expression: false, key: false, hidden: false, colName: 'name' }
    ]);

    assert.isTrue((await parser.next()).done);
  });
});
