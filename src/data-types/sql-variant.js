const { codepageBySortId, codepageByLcid } = require('../collation');

const TinyInt = require('./tinyint');
const Bit = require('./bit');
const SmallInt = require('./smallint');
const Int = require('./int');
const SmallDateTime = require('./smalldatetime');
const Real = require('./real');
const Money = require('./money');
const DateTime = require('./datetime');
const Float = require('./float');
const DecimalN = require('./decimaln');
const NumericN = require('./numericn');
const SmallMoney = require('./smallmoney');
const BigInt = require('./bigint');
const UniqueIdentifier = require('./uniqueidentifier');
const VarBinary = require('./varbinary');
const VarChar = require('./varchar');
const Binary = require('./binary');
const Char = require('./char');
const NVarChar = require('./nvarchar');
const NChar = require('./nchar');
const Time = require('./time');
const Date = require('./date');
const DateTime2 = require('./datetime2');
const DateTimeOffset = require('./datetimeoffset');

module.exports = {
  id: 0x62,
  type: 'SSVARIANTTYPE',
  name: 'Variant',
  dataLengthLength: 4,

  fromBuffer(buffer, offset, dataLength, options) {
    const baseType = buffer.readUInt8(offset);
    offset += 1;
    const propBytes = buffer.readUInt8(offset);
    offset += 1;

    dataLength -= 2 + propBytes;

    let precision, scale, collation, maxDataLength;

    switch (baseType) {
      case UniqueIdentifier.id:
      case Bit.id:
      case TinyInt.id:
      case SmallInt.id:
      case Int.id:
      case BigInt.id:
      case SmallDateTime.id:
      case DateTime.id:
      case Real.id:
      case Float.id:
      case SmallMoney.id:
      case Money.id:
      case Date.id:
        break;

      case NumericN.id:
      case DecimalN.id:
        precision = buffer.readUInt8(offset);
        offset += 1;
        // falls through

      case Time.id:
      case DateTime2.id:
      case DateTimeOffset.id:
        scale = buffer.readUInt8(offset);
        offset += 1;
        break;

      case Char.id:
      case VarChar.id:
      case NChar.id:
      case NVarChar.id:
        collation = {};
        collation.lcid = (buffer[offset + 2] & 0x0F) << 16;
        collation.lcid |= buffer[offset + 1] << 8;
        collation.lcid |= buffer[offset + 0];

        // This may not be extracting the correct nibbles in the correct order.
        collation.flags = buffer[offset + 3] >> 4;
        collation.flags |= buffer[offset + 2] & 0xF0;

        // This may not be extracting the correct nibble.
        collation.version = buffer[offset + 3] & 0x0F;

        collation.sortId = buffer[offset + 4];

        collation.codepage = codepageBySortId[collation.sortId] || codepageByLcid[collation.lcid] || 'CP1252';
        offset += 5;
        // falls through

      case Binary.id:
      case VarBinary.id:
        maxDataLength = buffer.readUInt16LE(offset);
        offset += 2;
        break;
    }

    switch (baseType) {
      case Bit.id:
        return Bit.fromBuffer(buffer, offset);

      case TinyInt.id:
        return TinyInt.fromBuffer(buffer, offset);

      case SmallInt.id:
        return SmallInt.fromBuffer(buffer, offset);

      case Int.id:
        return Int.fromBuffer(buffer, offset);

      case BigInt.id:
        return BigInt.fromBuffer(buffer, offset);

      case Real.id:
        return Real.fromBuffer(buffer, offset);

      case Float.id:
        return Float.fromBuffer(buffer, offset);

      case Char.id:
      case VarChar.id:
        return Char.fromBuffer(buffer, offset, dataLength, collation.codepage);

      case NChar.id:
      case NVarChar.id:
        return NChar.fromBuffer(buffer, offset, dataLength);

      case Binary.id:
      case VarBinary.id:
        return Binary.fromBuffer(buffer, offset, dataLength);

      case SmallDateTime.id:
        return SmallDateTime.fromBuffer(buffer, offset, options);

      case DateTime.id:
        return DateTime.fromBuffer(buffer, offset, options);

      case UniqueIdentifier.id:
        return UniqueIdentifier.fromBuffer(buffer, offset);

      case SmallMoney.id:
        return SmallMoney.fromBuffer(buffer, offset);

      case Money.id:
        return Money.fromBuffer(buffer, offset);

      case Date.id:
        return Date.fromBuffer(buffer, offset);

      case NumericN.id:
      case DecimalN.id:
        return NumericN.fromBuffer(buffer, offset, dataLength, scale);

      case Time.id:
        return Time.fromBuffer(buffer, offset, scale, options);

      case DateTime2.id:
        return DateTime2.fromBuffer(buffer, offset, scale, options);

      case DateTimeOffset.id:
        return DateTimeOffset.fromBuffer(buffer, offset, scale, options);
    }
  },

  declaration: function(parameter) {
    return 'sql_variant';
  }
};
