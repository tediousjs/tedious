import { Collation } from './collation';
import Parser, { ParserOptions } from './token/stream-parser';
import { TYPE, DataType } from './data-type';
import { CryptoMetadata } from './always-encrypted/types';

import { sprintf } from 'sprintf-js';

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
class NotEnoughDataError extends Error { }

function checkDataLength(buffer: Buffer, offset: number, numBytes: number): void {
  if (buffer.length < offset + numBytes) {
    throw new NotEnoughDataError();
  }
}

function readFromBuffer(parser: Parser, length: number): Buffer {
  checkDataLength(parser.buffer, parser.position, length);
  const result = parser.buffer.slice(parser.position, parser.position + length);
  parser.position += length;
  return result;
}

function readUInt8(parser: Parser): number {
  checkDataLength(parser.buffer, parser.position, 1);
  const data = parser.buffer.readUInt8(parser.position);
  parser.position += 1;
  return data;
}

function readUInt16LE(parser: Parser): number {
  checkDataLength(parser.buffer, parser.position, 2);
  const data = parser.buffer.readUInt16LE(parser.position);
  parser.position += 2;
  return data;
}

function readUInt32LE(parser: Parser): number {
  checkDataLength(parser.buffer, parser.position, 4);
  const data = parser.buffer.readUInt32LE(parser.position);
  parser.position += 4;
  return data;
}

function readBVarChar(parser: Parser): string {
  const length = readUInt8(parser) * 2;
  const data = readFromBuffer(parser, length).toString('ucs2');
  parser.position += length;
  return data;
}

function readUsVarChar(parser: Parser): string {
  const length = readUInt16LE(parser) * 2;
  const data = readFromBuffer(parser, length).toString('ucs2');
  parser.position += length;
  return data;
}

function readCollation(parser: Parser): Collation {
  // s2.2.5.1.2
  const collationData = readFromBuffer(parser, 5);
  return Collation.fromBuffer(collationData);
}

function readSchema(parser: Parser): XmlSchema | undefined {
  const schemaPresent = readUInt8(parser);
  if (schemaPresent === 0x01) {
    const dbname = readBVarChar(parser);
    const owningSchema = readBVarChar(parser);
    const xmlSchemaCollection = readUsVarChar(parser);
    return {
      dbname: dbname,
      owningSchema: owningSchema,
      xmlSchemaCollection: xmlSchemaCollection
    };
  } else {
    return undefined;
  }
}

function readUDTInfo(parser: Parser) {
  const maxByteSize = readUInt16LE(parser);
  const dbname = readBVarChar(parser);
  const owningSchema = readBVarChar(parser);
  const typeName = readBVarChar(parser);
  const assemblyName = readUsVarChar(parser);
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

  if (options.tdsVersion < '7_2') {
    userType = readUInt16LE(parser);
  } else {
    userType = readUInt32LE(parser);
  }

  const flags = readUInt16LE(parser);

  const typeNumber = readUInt8(parser);
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
      dataLength = readUInt8(parser);
      break;

    case 'Variant':
      dataLength = readUInt32LE(parser);
      break;

    case 'VarChar':
    case 'Char':
    case 'NVarChar':
    case 'NChar':
      dataLength = readUInt16LE(parser);
      collation = readCollation(parser);
      break;

    case 'Text':
    case 'NText':
      dataLength = readUInt32LE(parser);
      collation = readCollation(parser);
      break;

    case 'VarBinary':
    case 'Binary':
      dataLength = readUInt16LE(parser);
      break;

    case 'Image':
      dataLength = readUInt32LE(parser);
      break;

    case 'Xml':
      schema = readSchema(parser);
      break;

    case 'Time':
    case 'DateTime2':
    case 'DateTimeOffset':
      scale = readUInt8(parser);
      break;

    case 'NumericN':
    case 'DecimalN':
      dataLength = readUInt8(parser);
      precision = readUInt8(parser);
      scale = readUInt8(parser);
      break;

    case 'UDT':
      udtInfo = readUDTInfo(parser);
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
