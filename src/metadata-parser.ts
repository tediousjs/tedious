import { Collation } from './collation';
import Parser, { type ParserOptions } from './token/stream-parser';
import { TYPE, type DataType } from './data-type';
import { type CryptoMetadata } from './always-encrypted/types';

import { sprintf } from 'sprintf-js';

import { Result, NotEnoughDataError, readUInt8, readBVarChar, readUsVarChar, readUInt16LE, readUInt32LE } from './token/helpers';

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
  cryptoMetadata?: CryptoMetadata | undefined;
} & BaseMetadata;

function readCollation(buf: Buffer, offset: number): Result<Collation> {
  offset = +offset;

  if (buf.length < offset + 5) {
    throw new NotEnoughDataError(offset + 5);
  }

  const collation = Collation.fromBuffer(buf.slice(offset, offset + 5));
  return new Result(collation, offset + 5);
}

function readSchema(buf: Buffer, offset: number): Result<XmlSchema | undefined> {
  offset = +offset;

  let schemaPresent;
  ({ offset, value: schemaPresent } = readUInt8(buf, offset));

  if (schemaPresent !== 0x01) {
    return new Result(undefined, offset);
  }

  let dbname;
  ({ offset, value: dbname } = readBVarChar(buf, offset));

  let owningSchema;
  ({ offset, value: owningSchema } = readBVarChar(buf, offset));

  let xmlSchemaCollection;
  ({ offset, value: xmlSchemaCollection } = readUsVarChar(buf, offset));

  return new Result({ dbname, owningSchema, xmlSchemaCollection }, offset);
}

function readUDTInfo(buf: Buffer, offset: number): Result<UdtInfo> {
  let maxByteSize;
  ({ offset, value: maxByteSize } = readUInt16LE(buf, offset));

  let dbname;
  ({ offset, value: dbname } = readBVarChar(buf, offset));

  let owningSchema;
  ({ offset, value: owningSchema } = readBVarChar(buf, offset));

  let typeName;
  ({ offset, value: typeName } = readBVarChar(buf, offset));

  let assemblyName;
  ({ offset, value: assemblyName } = readUsVarChar(buf, offset));

  return new Result({
    maxByteSize: maxByteSize,
    dbname: dbname,
    owningSchema: owningSchema,
    typeName: typeName,
    assemblyName: assemblyName
  }, offset);
}

function readMetadata(buf: Buffer, offset: number, options: ParserOptions, shouldReadFlags: boolean): Result<Metadata> {
  let userType;
  ({ offset, value: userType } = (options.tdsVersion < '7_2' ? readUInt16LE : readUInt32LE)(buf, offset));

  let flags;
  shouldReadFlags ? ({ offset, value: flags } = readUInt16LE(buf, offset)) : flags = 0;

  let typeNumber;
  ({ offset, value: typeNumber } = readUInt8(buf, offset));

  const type: DataType = TYPE[typeNumber];
  if (!type) {
    throw new Error(sprintf('Unrecognised data type 0x%02X', typeNumber));
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
      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined
      }, offset);

    case 'IntN':
    case 'FloatN':
    case 'MoneyN':
    case 'BitN':
    case 'UniqueIdentifier':
    case 'DateTimeN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      }, offset);
    }

    case 'Variant': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      }, offset);
    }

    case 'VarChar':
    case 'Char':
    case 'NVarChar':
    case 'NChar': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt16LE(buf, offset));

      let collation;
      ({ offset, value: collation } = readCollation(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: collation,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      }, offset);
    }

    case 'Text':
    case 'NText': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      let collation;
      ({ offset, value: collation } = readCollation(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: collation,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      }, offset);
    }

    case 'VarBinary':
    case 'Binary': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt16LE(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      }, offset);
    }

    case 'Image': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      }, offset);
    }

    case 'Xml': {
      let schema;
      ({ offset, value: schema } = readSchema(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: schema,
        udtInfo: undefined
      }, offset);
    }

    case 'Time':
    case 'DateTime2':
    case 'DateTimeOffset': {
      let scale;
      ({ offset, value: scale } = readUInt8(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: scale,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined
      }, offset);
    }

    case 'NumericN':
    case 'DecimalN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      let precision;
      ({ offset, value: precision } = readUInt8(buf, offset));

      let scale;
      ({ offset, value: scale } = readUInt8(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: precision,
        scale: scale,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      }, offset);
    }

    case 'UDT': {
      let udtInfo;
      ({ offset, value: udtInfo } = readUDTInfo(buf, offset));

      return new Result({
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: undefined,
        udtInfo: udtInfo
      }, offset);
    }

    default:
      throw new Error(sprintf('Unrecognised type %s', type.name));
  }
}

function metadataParse(parser: Parser, options: ParserOptions, callback: (metadata: Metadata) => void, shouldReadFlags = true) {
  (async () => {
    while (true) {
      let result;
      try {
        result = readMetadata(parser.buffer, parser.position, options, shouldReadFlags);
      } catch (err: any) {
        if (err instanceof NotEnoughDataError) {
          await parser.waitForChunk();
          continue;
        }

        throw err;
      }

      parser.position = result.offset;
      return callback(result.value);
    }
  })();
}

export default metadataParse;
export { readCollation, readMetadata };

module.exports = metadataParse;
module.exports.readCollation = readCollation;
module.exports.readMetadata = readMetadata;
