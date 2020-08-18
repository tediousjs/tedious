import { codepageBySortId, codepageByLcid } from './collation';
import Parser from './token/stream-parser';
import { InternalConnectionOptions } from './connection';
import { TYPE, DataType } from './data-type';

import { sprintf } from 'sprintf-js';
import { uInt8, Result, bVarChar, usVarChar, uInt16LE, uInt32LE, IncompleteError } from './parser';

interface Collation {
  lcid: number;
  flags: number;
  version: number;
  sortId: number;
  codepage: string;
}

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

export interface Metadata {
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

function readCollation(buffer: Buffer, offset: number): Result<Collation> {
  if (buffer.length < offset + 5) {
    throw new IncompleteError();
  }

  // s2.2.5.1.2
  let lcid = (buffer[offset + 2] & 0x0F) << 16;
  lcid |= buffer[offset + 1] << 8;
  lcid |= buffer[offset];

  // This may not be extracting the correct nibbles in the correct order.
  let flags = buffer[offset + 3] >> 4;
  flags |= buffer[offset + 2] & 0xF0;

  // This may not be extracting the correct nibble.
  const version = buffer[offset + 3] & 0x0F;

  const sortId = buffer[offset + 4];

  const codepage = codepageBySortId[sortId] || codepageByLcid[lcid] || 'CP1252';

  return new Result(offset + 5, { lcid, flags, version, sortId, codepage });
}

function readSchema(buffer: Buffer, offset: number): Result<XmlSchema | undefined> {
  // s2.2.5.5.3
  let schemaPresent;
  ({ offset, value: schemaPresent } = uInt8(buffer, offset));

  if (schemaPresent !== 0x01) {
    return new Result(offset, undefined);
  }

  let dbname;
  ({ offset, value: dbname } = bVarChar(buffer, offset));

  let owningSchema;
  ({ offset, value: owningSchema } = bVarChar(buffer, offset));

  let xmlSchemaCollection;
  ({ offset, value: xmlSchemaCollection } = usVarChar(buffer, offset));

  return new Result(offset, {
    dbname: dbname,
    owningSchema: owningSchema,
    xmlSchemaCollection: xmlSchemaCollection
  });
}

function readUDTInfo(buffer: Buffer, offset: number): Result<UdtInfo> {
  let maxByteSize;
  ({ offset, value: maxByteSize } = uInt16LE(buffer, offset));

  let dbname;
  ({ offset, value: dbname } = bVarChar(buffer, offset));

  let owningSchema;
  ({ offset, value: owningSchema } = bVarChar(buffer, offset));

  let typeName;
  ({ offset, value: typeName } = bVarChar(buffer, offset));

  let assemblyName;
  ({ offset, value: assemblyName } = usVarChar(buffer, offset));

  return new Result(offset, {
    maxByteSize: maxByteSize,
    dbname: dbname,
    owningSchema: owningSchema,
    typeName: typeName,
    assemblyName: assemblyName
  });
}

function _metadataParse(buffer: Buffer, offset: number, options: InternalConnectionOptions): Result<Metadata> {
  let userType;
  ({ offset, value: userType } = options.tdsVersion < '7_2' ? uInt16LE(buffer, offset) : uInt32LE(buffer, offset));

  let flags;
  ({ offset, value: flags } = uInt16LE(buffer, offset));

  let typeNumber;
  ({ offset, value: typeNumber } = uInt8(buffer, offset));

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
      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined
      });

    case 'IntN':
    case 'FloatN':
    case 'MoneyN':
    case 'BitN':
    case 'UniqueIdentifier':
    case 'DateTimeN': {
      let dataLength;
      ({ offset, value: dataLength } = uInt8(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      });
    }

    case 'Variant': {
      let dataLength;
      ({ offset, value: dataLength } = uInt32LE(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      });
    }

    case 'VarChar':
    case 'Char':
    case 'NVarChar':
    case 'NChar': {
      let dataLength;
      ({ offset, value: dataLength } = uInt16LE(buffer, offset));

      let collation;
      ({ offset, value: collation } = readCollation(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: collation,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      });
    }

    case 'Text':
    case 'NText': {
      let dataLength;
      ({ offset, value: dataLength } = uInt32LE(buffer, offset));

      let collation;
      ({ offset, value: collation } = readCollation(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: collation,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      });
    }

    case 'VarBinary':
    case 'Binary': {
      let dataLength;
      ({ offset, value: dataLength } = uInt16LE(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      });
    }

    case 'Image': {
      let dataLength;
      ({ offset, value: dataLength } = uInt32LE(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      });
    }

    case 'Xml': {
      let schema;
      ({ offset, value: schema } = readSchema(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: schema,
        udtInfo: undefined
      });
    }

    case 'Time':
    case 'DateTime2':
    case 'DateTimeOffset': {
      let scale;
      ({ offset, value: scale } = uInt8(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: scale,
        dataLength: undefined,
        schema: undefined,
        udtInfo: undefined
      });
    }

    case 'NumericN':
    case 'DecimalN': {
      let dataLength;
      ({ offset, value: dataLength } = uInt8(buffer, offset));

      let precision;
      ({ offset, value: precision } = uInt8(buffer, offset));

      let scale;
      ({ offset, value: scale } = uInt8(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: precision,
        scale: scale,
        dataLength: dataLength,
        schema: undefined,
        udtInfo: undefined
      });
    }

    case 'UDT': {
      let udtInfo;
      ({ offset, value: udtInfo } = readUDTInfo(buffer, offset));

      return new Result(offset, {
        userType: userType,
        flags: flags,
        type: type,
        collation: undefined,
        precision: undefined,
        scale: undefined,
        dataLength: undefined,
        schema: undefined,
        udtInfo: udtInfo
      });
    }

    default:
      throw new Error(sprintf('Unrecognised type %s', type.name));
  }
}

function metadataParse(parser: Parser, options: InternalConnectionOptions, callback: (metadata: Metadata) => void) {
  let metadata;
  try {
    ({ offset: parser.position, value: metadata } = _metadataParse(parser.buffer, parser.position, options));
  } catch (err) {
    if (err instanceof IncompleteError) {
      return parser.suspend(() => {
        metadataParse(parser, options, callback);
      });
    }

    throw err;
  }

  callback(metadata);
}

export default metadataParse;
export { readCollation };

module.exports = metadataParse;
module.exports.readCollation = readCollation;
