import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { TabNameToken } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';
import { assert } from 'chai';

describe('TabName Token Parser', function() {
  const options = { tdsVersion: '7_4' } as ParserOptions;

  it('should parse a single one-part table name', async function() {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xa4);
    buffer.writeUInt16LE(1 + 2 + ('employees'.length * 2));
    buffer.writeUInt8(1);
    buffer.writeUsVarchar('employees');

    const parser = StreamParser.parseTokens([buffer.data], new Debug(), options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, TabNameToken);
    assert.deepEqual(token.tableNames, [['employees']]);

    assert.isTrue((await parser.next()).done);
  });

  it('should parse a multi-part table name', async function() {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xa4);
    buffer.writeUInt16LE(1 + 2 + ('dbo'.length * 2) + 2 + ('employees'.length * 2));
    buffer.writeUInt8(2);
    buffer.writeUsVarchar('dbo');
    buffer.writeUsVarchar('employees');

    const parser = StreamParser.parseTokens([buffer.data], new Debug(), options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, TabNameToken);
    assert.deepEqual(token.tableNames, [['dbo', 'employees']]);

    assert.isTrue((await parser.next()).done);
  });

  it('should parse multiple table names', async function() {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xa4);
    buffer.writeUInt16LE((1 + 2 + ('employees'.length * 2)) + (1 + 2 + ('teams'.length * 2)));
    buffer.writeUInt8(1);
    buffer.writeUsVarchar('employees');
    buffer.writeUInt8(1);
    buffer.writeUsVarchar('teams');

    const parser = StreamParser.parseTokens([buffer.data], new Debug(), options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, TabNameToken);
    assert.deepEqual(token.tableNames, [['employees'], ['teams']]);

    assert.isTrue((await parser.next()).done);
  });

  it('should parse the multi-part table name format on TDS 7.1', async function() {
    // Servers speaking TDS 7.1 already use the multi-part format, which was
    // introduced in TDS 7.1 Revision 1.
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xa4);
    buffer.writeUInt16LE(1 + 2 + ('employees'.length * 2));
    buffer.writeUInt8(1);
    buffer.writeUsVarchar('employees');

    const parser = StreamParser.parseTokens([buffer.data], new Debug(), { tdsVersion: '7_1' } as ParserOptions);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, TabNameToken);
    assert.deepEqual(token.tableNames, [['employees']]);

    assert.isTrue((await parser.next()).done);
  });

  it('should reject a token whose contents overrun its declared length', async function() {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xa4);
    buffer.writeUInt16LE(1); // declared length only covers the part count
    buffer.writeUInt8(1);
    buffer.writeUsVarchar('employees');

    const parser = StreamParser.parseTokens([buffer.data], new Debug(), options);

    let error;
    try {
      await parser.next();
    } catch (err: any) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.message, 'Malformed TABNAME token');
  });

  it('should parse a token that arrives in single byte chunks', async function() {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xa4);
    buffer.writeUInt16LE(1 + 2 + ('dbo'.length * 2) + 2 + ('employees'.length * 2));
    buffer.writeUInt8(2);
    buffer.writeUsVarchar('dbo');
    buffer.writeUsVarchar('employees');

    const chunks = Array.from(buffer.data, (byte) => Buffer.from([byte]));

    const parser = StreamParser.parseTokens(chunks, new Debug(), options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, TabNameToken);
    assert.deepEqual(token.tableNames, [['dbo', 'employees']]);

    assert.isTrue((await parser.next()).done);
  });
});
