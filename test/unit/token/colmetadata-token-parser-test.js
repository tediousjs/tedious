import { specifyDataType } from '../../../src/token/colmetadata-token-parser';
import { typeByName } from '../../../src/data-type';
const dataTypeByName = require('../../../src/data-type').typeByName;
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const TokenStreamParser = require('../../../src/token/stream-parser');
const assert = require('chai').assert;

const intN = require('../../../lib/data-types/intn');
const moneyN = require('../../../lib/data-types/moneyn');
const dateTimeN = require('../../../lib/data-types/datetimen');
const floatN = require('../../../lib/data-types/floatn');
const bitN = require('../../../lib/data-types/bitn');
const numericN = require('../../../lib/data-types/numericn');
const decimalN = require('../../../lib/data-types/decimaln');

describe('Colmetadata Token Parser', function() {
  it('should int', function() {
    const numberOfColumns = 1;
    const userType = 2;
    const flags = 3;
    const columnName = 'name';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0x81);
    buffer.writeUInt16LE(numberOfColumns);
    buffer.writeUInt32LE(userType);
    buffer.writeUInt16LE(flags);
    buffer.writeUInt8(dataTypeByName.Int.id);
    buffer.writeBVarchar(columnName);
    // console.log(buffer.data)

    const parser = new TokenStreamParser({ token() { } }, {}, {});
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.isOk(!token.error);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].userType, 2);
    assert.strictEqual(token.columns[0].flags, 3);
    assert.strictEqual(token.columns[0].type.name, 'Int');
    assert.strictEqual(token.columns[0].colName, 'name');
  });

  it('should varchar', function() {
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
    buffer.writeUInt8(dataTypeByName.VarChar.id);
    buffer.writeUInt16LE(length);
    buffer.writeBuffer(collation);
    buffer.writeBVarchar(columnName);
    // console.log(buffer)

    const parser = new TokenStreamParser({ token() { } }, {}, {});
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.isOk(!token.error);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].userType, 2);
    assert.strictEqual(token.columns[0].flags, 3);
    assert.strictEqual(token.columns[0].type.name, 'VarChar');
    assert.strictEqual(token.columns[0].collation.lcid, 0x0409);
    assert.strictEqual(token.columns[0].collation.codepage, 'CP1257');
    assert.strictEqual(token.columns[0].collation.flags, 0x57);
    assert.strictEqual(token.columns[0].collation.version, 0x8);
    assert.strictEqual(token.columns[0].collation.sortId, 0x9a);
    assert.strictEqual(token.columns[0].colName, 'name');
    assert.strictEqual(token.columns[0].dataLength, length);
  });

  describe('should specify data type', function() {
    it('should return correct intN type', function() {
      for (const [input, expected] of [
        [{ type: intN, dataLength: 1 }, typeByName.TinyInt.name],
        [{ type: intN, dataLength: 2 }, typeByName.SmallInt.name],
        [{ type: intN, dataLength: 4 }, typeByName.Int.name],
        [{ type: intN, dataLength: 8 }, typeByName.BigInt.name],
        [{ type: intN, dataLength: 0 }, undefined]
      ]) {

        const output = specifyDataType([input])[0].typeName;
        assert.strictEqual(output, expected);
      }
    });

    it('should return correct moneyN data type', function() {
      for (const [input, expected] of [
        [ { type: moneyN, dataLength: 4 }, typeByName.SmallMoney.name],
        [ { type: moneyN, dataLength: 8 }, typeByName.Money.name],
        [ { type: moneyN, dataLength: 0 }, undefined]
      ]) {

        const output = specifyDataType([input])[0].typeName;
        assert.strictEqual(output, expected);
      }
    });

    it('should return correct dateTimeN data type', function() {
      for (const [input, expected] of [
        [ { type: dateTimeN, dataLength: 4 }, typeByName.SmallDateTime.name],
        [ { type: dateTimeN, dataLength: 8 }, typeByName.DateTime.name],
        [ { type: dateTimeN, dataLength: 0 }, undefined]
      ]) {

        const output = specifyDataType([input])[0].typeName;
        assert.strictEqual(output, expected);
      }
    });

    it('should return correct floatN data type', function() {
      for (const [input, expected] of [
        [ { type: floatN, dataLength: 4 }, typeByName.Float.name],
        [ { type: floatN, dataLength: 8 }, typeByName.Float.name],
        [ { type: floatN, dataLength: 0 }, undefined]
      ]) {

        const output = specifyDataType([input])[0].typeName;
        assert.strictEqual(output, expected);
      }
    });

    it('should return correct BitN data type', function() {
      for (const [input, expected] of [
        [ { type: bitN, dataLength: 1 }, typeByName.Bit.name],
        [ { type: bitN, dataLength: 0 }, undefined]
      ]) {

        const output = specifyDataType([input])[0].typeName;
        assert.strictEqual(output, expected);
      }
    });

    it('should return correct NumericN data type', function() {
      for (const [input, expected] of [
        [ { type: numericN, dataLength: 17 }, typeByName.Numeric.name],
        [ { type: numericN, dataLength: 0 }, undefined]
      ]) {

        const output = specifyDataType([input])[0].typeName;
        assert.strictEqual(output, expected);
      }
    });

    it('should return correct DecimalN data type', function() {
      for (const [input, expected] of [
        [ { type: decimalN, dataLength: 17 }, typeByName.Decimal.name],
        [ { type: decimalN, dataLength: 0 }, undefined]
      ]) {

        const output = specifyDataType([input])[0].typeName;
        assert.strictEqual(output, expected);
      }
    });
  });
});
