const colmetadataTokenParser = require('../../../lib/token/colmetadata-token-parser');
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
      const intNCol1 = { type: intN, dataLength: 1 };
      const intCol1 = colmetadataTokenParser.specifyDataType(intNCol1);
      assert.strictEqual(intCol1.type.id, 48);

      const intNCol2 = { type: intN, dataLength: 2 };
      const intCol2 = colmetadataTokenParser.specifyDataType(intNCol2);
      assert.strictEqual(intCol2.type.id, 52);

      const intNCol4 = { type: intN, dataLength: 4 };
      const intCol4 = colmetadataTokenParser.specifyDataType(intNCol4);
      assert.strictEqual(intCol4.type.id, 56);

      const intNCol8 = { type: intN, dataLength: 8 };
      const intCol8 = colmetadataTokenParser.specifyDataType(intNCol8);
      assert.strictEqual(intCol8.type.id, 127);
    });

    it('should return correct moneyN data type', function() {
      const moneyNCol4 = { type: moneyN, dataLength: 4 };
      const moneyCol4 = colmetadataTokenParser.specifyDataType(moneyNCol4);
      assert.strictEqual(moneyCol4.type.id, 122);

      const moneyNCol8 = { type: moneyN, dataLength: 8 };
      const moneyCol8 = colmetadataTokenParser.specifyDataType(moneyNCol8);
      assert.strictEqual(moneyCol8.type.id, 60);
    });

    it('should return correct dateTimeN data type', function() {
      const dateTimeNCol4 = { type: dateTimeN, dataLength: 4 };
      const dateTimeCol4 = colmetadataTokenParser.specifyDataType(dateTimeNCol4);
      assert.strictEqual(dateTimeCol4.type.id, 58);

      const dateTimeNCol8 = { type: dateTimeN, dataLength: 8 };
      const dateTimeCol8 = colmetadataTokenParser.specifyDataType(dateTimeNCol8);
      assert.strictEqual(dateTimeCol8.type.id, 61);
    });

    it('should return correct floatN data type', function() {
      const floatNCol4 = { type: floatN, dataLength: 4 };
      const floatCol4 = colmetadataTokenParser.specifyDataType(floatNCol4);
      assert.strictEqual(floatCol4.type.id, 62);

      const floatNCol8 = { type: floatN, dataLength: 8 };
      const floatCol8 = colmetadataTokenParser.specifyDataType(floatNCol8);
      assert.strictEqual(floatCol8.type.id, 62);
    });

    it('should return correct BitN data type', function() {
      const bitNCol4 = { type: bitN, dataLength: 1 };
      const bitCol4 = colmetadataTokenParser.specifyDataType(bitNCol4);
      assert.strictEqual(bitCol4.type.id, 50);
    });

    it('should return correct NumericN data type', function() {
      const numericNCol1 = { type: numericN, dataLength: 17 };
      const numericCol1 = colmetadataTokenParser.specifyDataType(numericNCol1);
      assert.strictEqual(numericCol1.type.id, 63);
    });

    it('should return correct DecimalN data type', function() {
      const decimalNCol1 = { type: decimalN, dataLength: 17 };
      const decimalCol1 = colmetadataTokenParser.specifyDataType(decimalNCol1);
      assert.strictEqual(decimalCol1.type.id, 55);
    });
  });
});
