import { codepageByLcid } from './collation';
import { TYPE } from './data-type';
import { sprintf } from 'sprintf';

export default function*(parser, options) {
  let userType;
  if (options.tdsVersion < "7_2") {
    userType = yield parser.readUInt16LE();
  } else {
    userType = yield parser.readUInt32LE();
  }

  const flags = yield parser.readUInt16LE();
  const typeNumber = yield parser.readUInt8();
  const type = TYPE[typeNumber];

  if (!type) {
    throw new Error(sprintf('Unrecognised data type 0x%02X', typeNumber));
  }

  let dataLength;
  if ((type.id & 0x30) === 0x20) {
    // xx10xxxx - s2.2.4.2.1.3
    // Variable length
    switch (type.dataLengthLength) {
      case 0:
        dataLength = void 0;
        break;
      case 1:
        dataLength = yield parser.readUInt8();
        break;
      case 2:
        dataLength = yield parser.readUInt16LE();
        break;
      case 4:
        dataLength = yield parser.readUInt32LE();
        break;
      default:
        throw new Error("Unsupported dataLengthLength " + type.dataLengthLength + " for data type " + type.name);
    }
  }

  let precision;
  if (type.hasPrecision) {
    precision = yield parser.readUInt8();
  }

  let scale;
  if (type.hasScale) {
    scale = yield parser.readUInt8();
    if (type.dataLengthFromScale) {
      dataLength = type.dataLengthFromScale(scale);
    }
  }

  let collation;
  if (type.hasCollation) {
    // s2.2.5.1.2
    const collationData = yield parser.readBuffer(5);

    collation = {};

    collation.lcid = (collationData[2] & 0x0F) << 16;
    collation.lcid |= collationData[1] << 8;
    collation.lcid |= collationData[0];

    collation.codepage = codepageByLcid[collation.lcid];

    // This may not be extracting the correct nibbles in the correct order.
    collation.flags = collationData[3] >> 4;
    collation.flags |= collationData[2] & 0xF0;

    // This may not be extracting the correct nibble.
    collation.version = collationData[3] & 0x0F;

    collation.sortId = collationData[4];
  }

  let schema;
  if (type.hasSchemaPresent) {
    // s2.2.5.5.3
    const schemaPresent = yield parser.readUInt8();
    if (schemaPresent === 0x01) {
      schema = {
        dbname: yield* parser.readBVarChar(),
        owningSchema: yield* parser.readBVarChar(),
        xmlSchemaCollection: yield* parser.readUsVarChar()
      };
    }
  }

  let udtInfo;
  if (type.hasUDTInfo) {
    // s2.2.5.5.2
    udtInfo = {
      maxByteSize: yield parser.readUInt16LE(),
      dbname: yield* parser.readBVarChar(),
      owningSchema: yield* parser.readBVarChar(),
      typeName: yield* parser.readBVarChar(),
      assemblyName: yield* parser.readUsVarChar()
    };
  }

  return {
    userType: userType,
    flags: flags,
    type: type,
    collation: collation,
    precision: precision,
    scale: scale,
    dataLength: dataLength,
    schema: schema,
    udtInfo: udtInfo
  };
}
