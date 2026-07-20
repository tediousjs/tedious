import { assert } from 'chai';

import Parser, { type ParserOptions } from '../../../src/token/stream-parser';
import { NBCRowToken } from '../../../src/token/token';
import { type ColumnMetadata } from '../../../src/token/colmetadata-token-parser';
import { typeByName as dataTypeByName } from '../../../src/data-type';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';
import { Collation } from '../../../src/collation';

const options = {
  useUTC: false,
  tdsVersion: '7_2'
} as ParserOptions;

describe('NBCRow Token Parser', function() {
  describe('parsing a row with many columns', function() {
    it('should parse them correctly', async function() {
      const debug = new Debug();
      const buffer = new WritableTrackingBuffer(0, 'ascii');
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
        buffer.writeUsVarchar(i.toString());
      }

      const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
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

  it('should parse json', async function() {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [{
      colName: 'col0',
      userType: 0,
      flags: 0,
      precision: undefined,
      scale: undefined,
      dataLength: undefined,
      schema: undefined,
      udtInfo: undefined,
      type: dataTypeByName.JSON,
      collation: undefined
    }];
    const value = '{"a":"\u00fc"}';
    const payload = Buffer.from(value, 'utf8');

    const buffer = new WritableTrackingBuffer(0);
    buffer.writeUInt8(0xd2);
    buffer.writeUInt8(0x00); // null bitmap - column is not null
    buffer.writeUInt64LE(payload.length); // PLP total length
    buffer.writeUInt32LE(payload.length); // chunk length
    buffer.writeBuffer(payload);
    buffer.writeUInt32LE(0); // PLP terminator

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, NBCRowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });
});
