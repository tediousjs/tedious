import { assert } from 'chai';
import MoneyN from '../../../src/data-types/moneyn';
import Money from '../../../src/data-types/money';
import SmallMoney from '../../../src/data-types/smallmoney';
import IntN from '../../../src/data-types/intn';
import FloatN from '../../../src/data-types/floatn';
import DateTimeN from '../../../src/data-types/datetimen';
import NumericN from '../../../src/data-types/numericn';

import Parser, { type ParserOptions } from '../../../src/token/stream-parser';
import { RowToken } from '../../../src/token/token';
import { type ColumnMetadata } from '../../../src/token/colmetadata-token-parser';
import { typeByName as dataTypeByName } from '../../../src/data-type';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';
import { Collation } from '../../../src/collation';

const options = {
  useUTC: false,
  tdsVersion: '7_2'
} as ParserOptions;

describe('Row Token Parser', () => {
  describe('parsing a row with many columns', function() {
    it('should parse them correctly', async function() {
      const debug = new Debug();
      const buffer = new WritableTrackingBuffer(0, 'ascii');
      buffer.writeUInt8(0xd1);

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

      assert.instanceOf(token, RowToken);
      assert.strictEqual(token.columns.length, 1024);

      for (let i = 0; i < 1024; i += 1) {
        assert.strictEqual(token.columns[i].value, i.toString());
        assert.strictEqual(token.columns[i].metadata, colMetadata[i]);
      }

      assert.isTrue((await parser.next()).done);
    });
  });

  it('should write int', async () => {
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
      type: dataTypeByName.Int,
      collation: undefined
    }];
    const value = 3;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt32LE(value);

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write bigint', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.BigInt,
        collation: undefined
      },
      {
        colName: 'col1',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.BigInt,
        collation: undefined
      }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 127])
    );

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual('1', token.columns[0].value);
    assert.strictEqual('9223372036854775807', token.columns[1].value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write real', async () => {
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
      type: dataTypeByName.Real,
      collation: undefined
    }];
    const value = 9.5;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(Buffer.from([0x00, 0x00, 0x18, 0x41]));

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    // console.log(token)
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write float', async () => {
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
      type: dataTypeByName.Float,
      collation: undefined
    }];
    const value = 9.5;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40])
    );

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write Money', async () => {
    const debug = new Debug();
    const baseMetadata = {
      userType: 0,
      flags: 0,
      precision: undefined,
      scale: undefined,
      dataLength: undefined,
      schema: undefined,
      udtInfo: undefined,
      collation: undefined
    };
    const colMetadata: ColumnMetadata[] = [
      { ...baseMetadata, colName: 'col0', type: SmallMoney },
      { ...baseMetadata, colName: 'col1', type: Money },
      { ...baseMetadata, colName: 'col2', type: MoneyN },
      { ...baseMetadata, colName: 'col3', type: MoneyN },
      { ...baseMetadata, colName: 'col4', type: MoneyN },
      { ...baseMetadata, colName: 'col5', type: MoneyN }
    ];
    const value = 123.456;
    const valueLarge = 123456789012345.11;

    const buffer = new WritableTrackingBuffer(0);
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(Buffer.from([0x80, 0xd6, 0x12, 0x00]));
    buffer.writeBuffer(
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00])
    );
    buffer.writeBuffer(Buffer.from([0x00]));
    buffer.writeBuffer(Buffer.from([0x04, 0x80, 0xd6, 0x12, 0x00]));
    buffer.writeBuffer(
      Buffer.from([0x08, 0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00])
    );
    buffer.writeBuffer(
      Buffer.from([0x08, 0xf4, 0x10, 0x22, 0x11, 0xdc, 0x6a, 0xe9, 0x7d])
    );

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 6);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[1].value, value);
    assert.strictEqual(token.columns[2].value, null);
    assert.strictEqual(token.columns[3].value, value);
    assert.strictEqual(token.columns[4].value, value);
    assert.strictEqual(token.columns[5].value, valueLarge);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varchar without code page', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.VarChar,
        collation: new Collation(1033, 0, 0, 52)
      }
    ];
    const value = 'abcde';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUsVarchar(value);
    // console.log(buffer.data)


    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varchar with code page', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.VarChar,
        collation: Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xD0, 0x00, 0x34]))
      }
    ];
    const value = 'abcdé';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUsVarchar(value);
    // console.log(buffer.data)


    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write nvarchar', async () => {
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
      type: dataTypeByName.NVarChar,
      collation: new Collation(1033, 0, 0, 52)
    }];
    const value = 'abc';

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt16LE(value.length * 2);
    buffer.writeString(value);
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varBinary', async () => {
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
      type: dataTypeByName.VarBinary,
      collation: undefined
    }];
    const value = Buffer.from([0x12, 0x34]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt16LE(value.length);
    buffer.writeBuffer(Buffer.from(value));
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write binary', async () => {
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
      type: dataTypeByName.Binary,
      collation: undefined
    }];
    const value = Buffer.from([0x12, 0x34]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt16LE(value.length);
    buffer.writeBuffer(Buffer.from(value));
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharMaxNull', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: 65535,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.VarChar,
        collation: new Collation(1033, 0, 0, 52)
      }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharMaxUnkownLength', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: 65535,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.VarChar,
        collation: new Collation(1033, 0, 0, 52)
      }
    ];
    const value = 'abcdef';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(0, 3));
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(3, 6));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharMaxKnownLength', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: 65535,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.VarChar,
        collation: new Collation(1033, 0, 0, 52)
      }
    ];
    const value = 'abcdef';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt64LE(value.length);
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(0, 3));
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(3, 6));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)


    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharmaxWithCodePage', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: 65535,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.VarChar,
        collation: Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xD0, 0x00, 0x34]))
      }
    ];
    const value = 'abcdéf';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt64LE(value.length);
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(0, 3));
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(3, 6));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharMaxKnownLengthWrong', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: 65535,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.VarChar,
        collation: Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xD0, 0x00, 0x34]))
      }
    ];
    const value = 'abcdef';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt64LE(value.length + 1);
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(0, 3));
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(3, 6));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);

    let error;
    try {
      await parser.next();
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.message, 'Partially Length-prefixed Bytes unmatched lengths : expected 7, but got 6 bytes');
    assert.isTrue((await parser.next()).done);
  });

  it('should write varBinaryMaxNull', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: 65535,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.VarBinary,
        collation: undefined
      }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varBinaryMaxUnknownLength', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: undefined,
        scale: undefined,
        dataLength: 65535,
        schema: undefined,
        udtInfo: undefined,
        type: dataTypeByName.VarBinary,
        collation: undefined
      }
    ];
    const value = Buffer.from([0x12, 0x34, 0x56, 0x78]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
    buffer.writeUInt32LE(2);
    buffer.writeBuffer(Buffer.from(value.slice(0, 2)));
    buffer.writeUInt32LE(2);
    buffer.writeBuffer(Buffer.from(value.slice(2, 4)));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)
    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write intN', async () => {
    const debug = new Debug();
    const baseMetadata = {
      userType: 0,
      flags: 0,
      precision: undefined,
      scale: undefined,
      dataLength: undefined,
      schema: undefined,
      udtInfo: undefined,
      collation: undefined
    };
    const colMetadata: ColumnMetadata[] = [
      { ...baseMetadata, colName: 'col0', type: IntN },
      { ...baseMetadata, colName: 'col1', type: IntN },
      { ...baseMetadata, colName: 'col2', type: IntN },
      { ...baseMetadata, colName: 'col3', type: IntN },
      { ...baseMetadata, colName: 'col4', type: IntN },
      { ...baseMetadata, colName: 'col5', type: IntN },
      { ...baseMetadata, colName: 'col6', type: IntN },
      { ...baseMetadata, colName: 'col7', type: IntN },
      { ...baseMetadata, colName: 'col8', type: IntN },
      { ...baseMetadata, colName: 'col9', type: IntN },
      { ...baseMetadata, colName: 'col10', type: IntN },
      { ...baseMetadata, colName: 'col11', type: IntN }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([
        0,
        8,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        8,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        8,
        255,
        255,
        255,
        255,
        255,
        255,
        255,
        255,
        8,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        8,
        254,
        255,
        255,
        255,
        255,
        255,
        255,
        255,
        8,
        255,
        255,
        255,
        255,
        255,
        255,
        255,
        127,
        8,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        128,
        8,
        10,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        8,
        100,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        8,
        232,
        3,
        0,
        0,
        0,
        0,
        0,
        0,
        8,
        16,
        39,
        0,
        0,
        0,
        0,
        0,
        0
      ])
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 12);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual('0', token.columns[1].value);
    assert.strictEqual('1', token.columns[2].value);
    assert.strictEqual('-1', token.columns[3].value);
    assert.strictEqual('2', token.columns[4].value);
    assert.strictEqual('-2', token.columns[5].value);
    assert.strictEqual('9223372036854775807', token.columns[6].value);
    assert.strictEqual('-9223372036854775808', token.columns[7].value);
    assert.strictEqual('10', token.columns[8].value);
    assert.strictEqual('100', token.columns[9].value);
    assert.strictEqual('1000', token.columns[10].value);
    assert.strictEqual('10000', token.columns[11].value);
    assert.isTrue((await parser.next()).done);
  });

  it('parsing a UniqueIdentifier value when `lowerCaseGuids` option is `false`', async () => {
    const debug = new Debug();
    const baseMetadata = {
      userType: 0,
      flags: 0,
      precision: undefined,
      scale: undefined,
      dataLength: undefined,
      schema: undefined,
      udtInfo: undefined,
      collation: undefined
    };
    const colMetadata: ColumnMetadata[] = [
      { ...baseMetadata, colName: 'col0', type: dataTypeByName.UniqueIdentifier },
      { ...baseMetadata, colName: 'col1', type: dataTypeByName.UniqueIdentifier }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([
        0,
        16,
        0x01,
        0x23,
        0x45,
        0x67,
        0x89,
        0xab,
        0xcd,
        0xef,
        0x01,
        0x23,
        0x45,
        0x67,
        0x89,
        0xab,
        0xcd,
        0xef
      ])
    );
    // console.log(buffer.data)


    const parser = Parser.parseTokens([buffer.data], debug, { ...options, lowerCaseGuids: false }, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual(token.columns[0].value, null);
    assert.deepEqual(
      '67452301-AB89-EFCD-0123-456789ABCDEF',
      token.columns[1].value
    );
    assert.isTrue((await parser.next()).done);

  });

  it('parsing a UniqueIdentifier value when `lowerCaseGuids` option is `true`', async () => {
    const debug = new Debug();
    const baseMetadata = {
      userType: 0,
      flags: 0,
      precision: undefined,
      scale: undefined,
      dataLength: undefined,
      schema: undefined,
      udtInfo: undefined,
      collation: undefined
    };
    const colMetadata: ColumnMetadata[] = [
      { ...baseMetadata, colName: 'col0', type: dataTypeByName.UniqueIdentifier },
      { ...baseMetadata, colName: 'col1', type: dataTypeByName.UniqueIdentifier }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([
        0,
        16,
        0x01,
        0x23,
        0x45,
        0x67,
        0x89,
        0xab,
        0xcd,
        0xef,
        0x01,
        0x23,
        0x45,
        0x67,
        0x89,
        0xab,
        0xcd,
        0xef
      ])
    );

    const parser = Parser.parseTokens([buffer.data], debug, { ...options, lowerCaseGuids: true }, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual(token.columns[0].value, null);
    assert.deepEqual(
      '67452301-ab89-efcd-0123-456789abcdef',
      token.columns[1].value
    );
    assert.isTrue((await parser.next()).done);
  });

  it('should write floatN', async () => {
    const debug = new Debug();
    const baseMetadata = {
      userType: 0,
      flags: 0,
      precision: undefined,
      scale: undefined,
      dataLength: undefined,
      schema: undefined,
      udtInfo: undefined,
      collation: undefined
    };
    const colMetadata: ColumnMetadata[] = [
      { ...baseMetadata, colName: 'col0', type: FloatN },
      { ...baseMetadata, colName: 'col1', type: FloatN },
      { ...baseMetadata, colName: 'col2', type: FloatN }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([
        0,
        4,
        0x00,
        0x00,
        0x18,
        0x41,
        8,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x23,
        0x40
      ])
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 3);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(9.5, token.columns[1].value);
    assert.strictEqual(9.5, token.columns[2].value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write datetime', async () => {
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
      type: dataTypeByName.DateTime,
      collation: undefined
    }];

    const days = 2; // 3rd January 1900
    const threeHundredthsOfSecond = 45 * 300; // 45 seconds

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeInt32LE(days);
    buffer.writeUInt32LE(threeHundredthsOfSecond);
    // console.log(buffer)

    {
      const parser = Parser.parseTokens([buffer.data], debug, { ...options, useUTC: false }, colMetadata);

      let result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.instanceOf(token, RowToken);
      assert.strictEqual(token.columns.length, 1);
      assert.strictEqual(
        token.columns[0].value.getTime(),
        new Date('January 3, 1900 00:00:45').getTime()
      );

      result = await parser.next();
      assert.isTrue(result.done);
      assert.isTrue((await parser.next()).done);
    }

    {
      const parser = Parser.parseTokens([buffer.data], debug, { ...options, useUTC: true }, colMetadata);

      let result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.instanceOf(token, RowToken);
      assert.strictEqual(token.columns.length, 1);
      assert.strictEqual(
        token.columns[0].value.getTime(),
        new Date('January 3, 1900 00:00:45 GMT').getTime()
      );

      result = await parser.next();
      assert.isTrue(result.done);
      assert.isTrue((await parser.next()).done);
    }
  });

  it('should write datetimeN', async () => {
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
      type: DateTimeN,
      collation: undefined
    }];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(0);
    // console.log(buffer)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    // console.log(token)
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric4Bytes', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: 3,
        scale: 1,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: NumericN,
        collation: undefined
      }
    ];

    const value = 9.3;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 4);
    buffer.writeUInt8(1); // positive
    buffer.writeUInt32LE(93);
    // console.log(buffer)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    // console.log(token)
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric4BytesNegative', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: 3,
        scale: 1,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: NumericN,
        collation: undefined
      }
    ];

    const value = -9.3;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 4);
    buffer.writeUInt8(0); // negative
    buffer.writeUInt32LE(93);
    // console.log(buffer)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric8Bytes', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: 13,
        scale: 1,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: NumericN,
        collation: undefined
      }
    ];

    const value = (0x100000000 + 93) / 10;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 8);
    buffer.writeUInt8(1); // positive
    buffer.writeUInt32LE(93);
    buffer.writeUInt32LE(1);
    // console.log(buffer)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    // console.log(token)
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric12Bytes', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: 23,
        scale: 1,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: NumericN,
        collation: undefined
      }
    ];

    const value = (0x100000000 * 0x100000000 + 0x200000000 + 93) / 10;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 12);
    buffer.writeUInt8(1); // positive
    buffer.writeUInt32LE(93);
    buffer.writeUInt32LE(2);
    buffer.writeUInt32LE(1);
    // console.log(buffer)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    // console.log(token)
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric16Bytes', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: 33,
        scale: 1,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: NumericN,
        collation: undefined
      }
    ];

    const value =
      (0x100000000 * 0x100000000 * 0x100000000 +
        0x200000000 * 0x100000000 +
        0x300000000 +
        93) /
      10;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 16);
    buffer.writeUInt8(1); // positive
    buffer.writeUInt32LE(93);
    buffer.writeUInt32LE(3);
    buffer.writeUInt32LE(2);
    buffer.writeUInt32LE(1);
    // console.log(buffer)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    // console.log(token)
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numericNull', async () => {
    const debug = new Debug();
    const colMetadata: ColumnMetadata[] = [
      {
        colName: 'col0',
        userType: 0,
        flags: 0,
        precision: 3,
        scale: 1,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined,
        type: NumericN,
        collation: undefined
      }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt8(0);
    // console.log(buffer)

    const parser = Parser.parseTokens([buffer.data], debug, options, colMetadata);
    const result = await parser.next();
    // console.log(token)
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, RowToken);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.isTrue((await parser.next()).done);
  });
});
