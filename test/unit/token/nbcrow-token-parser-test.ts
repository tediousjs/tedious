import { assert } from 'chai';

import Parser, { type ParserOptions } from '../../../src/token/stream-parser';
import { NBCRowToken } from '../../../src/token/token';
import { type ColumnMetadata } from '../../../src/token/colmetadata-token-parser';
import { typeByName as dataTypeByName } from '../../../src/data-type';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';

const debug = new Debug();
const options: ParserOptions = {
  useUTC: false,
  tdsVersion: '7_2'
};

describe('NBCRow Token Parser', function() {
  describe('parsing a row with many columns', function() {
    it('should parse them correctly', async function() {
      const buffer = new WritableTrackingBuffer(0, 'ascii');
      buffer.writeUInt8(0xd2);

      // Write the null bitmap
      buffer.writeBuffer(Buffer.alloc(1024 / 8, 0));

      const colMetadata = [];
      for (let i = 0; i < 1024; i += 1) {
        colMetadata.push({
          type: dataTypeByName.VarChar,
          collation: {
            codepage: undefined
          }
        });
        buffer.writeUsVarchar(i.toString());
      }

      const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata as ColumnMetadata[]);
      const result = await parser.next();
      assert.isFalse(result.done);
      const token = result.value;

      assert.strictEqual((token as NBCRowToken).columns.length, 1024);

      for (let i = 0; i < 1024; i += 1) {
        assert.strictEqual((token as NBCRowToken).columns[i].value, i.toString());
        assert.strictEqual((token as NBCRowToken).columns[i].metadata, colMetadata[i]);
      }

      assert.isTrue((await parser.next()).done);
    });
  });
});
