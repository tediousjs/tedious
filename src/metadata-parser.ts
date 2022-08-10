import { Collation } from './collation';
import Parser, { ParserOptions } from './token/stream-parser';
import { TYPE, DataType } from './data-type';
import { CryptoMetadata } from './always-encrypted/types';

import { sprintf } from 'sprintf-js';
import BufferReader from './token/buffer-reader';

interface XmlSchema {
  dbname: string;
  owningSchema: string;
  xmlSchemaCollection: string;
}

interface UdtInfo {
  maxByteSize: number;
  dbname: string;
  owningSchema: string;
  typeName: string;
  assemblyName: string;
}

export type BaseMetadata = {
  userType: number;

  flags: number;
  /**
   * The column's type, such as VarChar, Int or Binary.
   */
  type: DataType;

  collation: Collation | undefined;
  /**
   * The precision. Only applicable to numeric and decimal.
   */
  precision: number | undefined;

  /**
   * The scale. Only applicable to numeric, decimal, time, datetime2 and datetimeoffset.
   */
  scale: number | undefined;

  /**
   * The length, for char, varchar, nvarchar and varbinary.
   */
  dataLength: number | undefined;

  schema: XmlSchema | undefined;

  udtInfo: UdtInfo | undefined;
}

export type Metadata = {
  cryptoMetadata?: CryptoMetadata;
} & BaseMetadata;

class UnknownTypeError extends Error { }

function readCollation(br: BufferReader): Collation {
  // s2.2.5.1.2
  const collationData = br.readFromBuffer(5);
  return Collation.fromBuffer(collationData);
}

function readSchema(br: BufferReader): XmlSchema | undefined {
  const schemaPresent = br.readUInt8();
  if (schemaPresent === 0x01) {
    const dbname = br.readBVarChar();
    const owningSchema = br.readBVarChar();
    const xmlSchemaCollection = br.readUsVarChar();
    return {
      dbname: dbname,
      owningSchema: owningSchema,
      xmlSchemaCollection: xmlSchemaCollection
    };
  } else {
    return undefined;
  }
}

function readUDTInfo(br: BufferReader): UdtInfo {
  const maxByteSize = br.readUInt16LE();
  const dbname = br.readBVarChar();
  const owningSchema = br.readBVarChar();
  const typeName = br.readBVarChar();
  const assemblyName = br.readUsVarChar();
  return {
    maxByteSize: maxByteSize,
    dbname: dbname,
    owningSchema: owningSchema,
    typeName: typeName,
    assemblyName: assemblyName
  };
}

function metadataParse(parser: Parser, options: ParserOptions): Metadata {
  let userType: number;
  const br = new BufferReader(parser);

  if (options.tdsVersion < '7_2') {
    userType = br.readUInt16LE();
  } else {
    userType = br.readUInt32LE();
  }

  const flags = br.readUInt16LE();

  const typeNumber = br.readUInt8();
  const type: DataType = TYPE[typeNumber];

  let collation: Collation | undefined;
  let precision: number | undefined;
  let scale: number | undefined;
  let dataLength: number | undefined;
  let schema: XmlSchema | undefined;
  let udtInfo: UdtInfo | undefined;

  if (!type) {
    throw new UnknownTypeError(sprintf('Unrecognised data type 0x%02X', typeNumber));
  }

  switch (type.name) {
    case 'Null':
    case 'TinyInt':
    case 'SmallInt':
    case 'Int':
    case 'BigInt':
    case 'Real':
    case 'Float':
    case 'SmallMoney':
    case 'Money':
    case 'Bit':
    case 'SmallDateTime':
    case 'DateTime':
    case 'Date':
      break;

    case 'IntN':
    case 'FloatN':
    case 'MoneyN':
    case 'BitN':
    case 'UniqueIdentifier':
    case 'DateTimeN':
      dataLength = br.readUInt8();
      break;

    case 'Variant':
      dataLength = br.readUInt32LE();
      break;

    case 'VarChar':
    case 'Char':
    case 'NVarChar':
    case 'NChar':
      dataLength = br.readUInt16LE();
      collation = readCollation(br);
      break;

    case 'Text':
    case 'NText':
      dataLength = br.readUInt32LE();
      collation = readCollation(br);
      break;

    case 'VarBinary':
    case 'Binary':
      dataLength = br.readUInt16LE();
      break;

    case 'Image':
      dataLength = br.readUInt32LE();
      break;

    case 'Xml':
      schema = readSchema(br);
      break;

    case 'Time':
    case 'DateTime2':
    case 'DateTimeOffset':
      scale = br.readUInt8();
      break;

    case 'NumericN':
    case 'DecimalN':
      dataLength = br.readUInt8();
      precision = br.readUInt8();
      scale = br.readUInt8();
      break;

    case 'UDT':
      udtInfo = readUDTInfo(br);
      break;

    default:
      throw new UnknownTypeError(sprintf('Unrecognised type %s', type.name));
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

export default metadataParse;
export { readCollation };

module.exports = metadataParse;
module.exports.readCollation = readCollation;
