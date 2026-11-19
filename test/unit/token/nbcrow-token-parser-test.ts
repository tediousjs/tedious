import { assert } from 'chai';

import Parser, { type ParserOptions } from '../../../src/token/stream-parser';
import { NBCRowToken } from '../../../src/token/token';
import { type ColumnMetadata } from '../../../src/token/colmetadata-token-parser';
import { typeByName as dataTypeByName } from '../../../src/data-type';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { Collation } from '../../../src/collation';

const options = {
  useUTC: false,
  tdsVersion: '7_2'
} as ParserOptions;

describe('NBCRow Token Parser', function() {
  describe('parsing a row with many columns', function() {
    it('should parse them correctly', async function() {
      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0xd2);

      // Write the null bitmap
      buffer.writeBuffer(Buffer.alloc(1024 / 8, 0));

      const colMetadata: ColumnMetadata[] = [];
      for (let i = 0; i < 1024; i += 1) {
        colMetadata.push({
          colName: `col${i}`,
          userType: 0,
          flags: 0,
          precision: undefined,
          scale: undefined,
          dataLength: undefined,
          schema: undefined,
          udtInfo: undefined,
          type: dataTypeByName.VarChar,
          collation: new Collation(1033, 0, 0, 52)
        });
        buffer.writeUsVarchar(i.toString(), 'ascii');
      }

      const parser = Parser.parseTokens([buffer.data], options, colMetadata);
      const result = await parser.next();
      assert.isFalse(result.done);
      const token = result.value;

      assert.instanceOf(token, NBCRowToken);
      assert.strictEqual(token.columns.length, 1024);

      for (let i = 0; i < 1024; i += 1) {
        assert.strictEqual(token.columns[i].value, i.toString());
        assert.strictEqual(token.columns[i].metadata, colMetadata[i]);
      }

      assert.isTrue((await parser.next()).done);
    });
  });

  it('should parse vector values next to null bitmap nulls', async function() {
    const vector = (name: string, baseType: 'float32' | 'float16', dataLength: number): ColumnMetadata => ({
      colName: name,
      userType: 0,
      flags: 1,
      precision: undefined,
      scale: undefined,
      dataLength,
      schema: undefined,
      udtInfo: undefined,
      type: dataTypeByName.Vector,
      collation: undefined,
      baseType,
      dimensions: 3
    });
    const colMetadata = [vector('a', 'float32', 20), vector('b', 'float32', 20)];

    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xd2);
    buffer.writeUInt8(0b00000001); // `a` is null
    buffer.writeUInt16LE(20);
    buffer.writeBuffer(Buffer.from('a9010300000000000000803f00002040000040c0', 'hex'));

    const token = (await Parser.parseTokens([buffer.data], options, colMetadata).next()).value;
    assert.instanceOf(token, NBCRowToken);
    assert.isNull(token.columns[0].value);
    assert.instanceOf(token.columns[1].value, Float32Array);
    assert.deepEqual(Array.from(token.columns[1].value), [1, 2.5, -3]);
  });
});
