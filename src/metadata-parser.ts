import { Collation } from './collation';
import { type ParserOptions } from './token/stream-parser';
import { TYPE, type DataType } from './data-type';
import { type ColumnEncryptionKeyInfo, type CryptoMetadata, encryptionTypeFromId } from './always-encrypted/types';

import { formatHex } from './format-hex';

import { Result, NotEnoughDataError, readUInt8, readBVarChar, readUsVarChar, readUInt16LE, readUInt32LE } from './token/helpers';

// The column or return value is encrypted, and its type is followed by its
// `CryptoMetadata`.
const FLAG_ENCRYPTED = 0x0800;

// The id of a custom encryption algorithm, which is followed by its name.
const CUSTOM_ALGORITHM_ID = 0;

const MAX = (1 << 16) - 1;

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
  /**
   * How the values are encrypted, if the column is encrypted using Always
   * Encrypted and {@link ConnectionOptions.columnEncryption} is enabled. The
   * other fields then describe the decrypted values.
   */
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

/**
 * Reads the metadata of a column or of a return value.
 *
 * @param cekTable
 *   The column encryption keys of the result set the column belongs to, as
 *   the metadata of an encrypted column refers to one of them.
 */
function readMetadata(buf: Buffer, offset: number, options: ParserOptions, cekTable?: ColumnEncryptionKeyInfo[]): Result<Metadata> {
  let userType;
  ({ offset, value: userType } = (options.tdsVersion < '7_2' ? readUInt16LE : readUInt32LE)(buf, offset));

  let flags;
  ({ offset, value: flags } = readUInt16LE(buf, offset));

  let metadata;
  ({ offset, value: metadata } = readTypeInfo(buf, offset, userType, flags));

  if ((flags & FLAG_ENCRYPTED) !== 0 && options.serverSupportsColumnEncryption) {
    return readCryptoMetadata(buf, offset, metadata, options, cekTable);
  }

  return new Result(metadata, offset);
}

/**
 * Reads the `CryptoMetadata` that follows the type of an encrypted column
 * or return value.
 *
 * The type that precedes it (`encrypted`) is the one of the encrypted
 * values as they are sent, a `varbinary`. The type of the decrypted values
 * is part of the `CryptoMetadata`, and is what the returned metadata
 * describes - unless column encryption is disabled, in which case values
 * stay encrypted and are described as such.
 */
function readCryptoMetadata(buf: Buffer, offset: number, encrypted: Metadata, options: ParserOptions, cekTable: ColumnEncryptionKeyInfo[] | undefined): Result<Metadata> {
  // Return values do not refer to a column encryption key, they are
  // encrypted with the key of the parameter they are returned for.
  let key;
  if (cekTable !== undefined) {
    let ordinal;
    ({ offset, value: ordinal } = readUInt16LE(buf, offset));

    key = cekTable[ordinal];
    if (key === undefined) {
      throw new Error(`Unknown column encryption key ordinal ${ordinal}`);
    }
  }

  let userType;
  ({ offset, value: userType } = readUInt32LE(buf, offset));

  let metadata;
  ({ offset, value: metadata } = readTypeInfo(buf, offset, userType, encrypted.flags));

  let algorithmId;
  ({ offset, value: algorithmId } = readUInt8(buf, offset));

  let algorithmName;
  if (algorithmId === CUSTOM_ALGORITHM_ID) {
    ({ offset, value: algorithmName } = readBVarChar(buf, offset));
  }

  let encryptionType;
  ({ offset, value: encryptionType } = readUInt8(buf, offset));

  let normalizationRuleVersion;
  ({ offset, value: normalizationRuleVersion } = readUInt8(buf, offset));

  if (options.columnEncryption === undefined) {
    return new Result(encrypted, offset);
  }

  if (encrypted.type.name !== 'VarBinary' && encrypted.type.name !== 'Binary') {
    throw new Error(`Unexpected type ${encrypted.type.name} of an encrypted value`);
  }

  metadata.cryptoMetadata = {
    key,
    encryptionType: encryptionTypeFromId(encryptionType),
    algorithmId,
    algorithmName,
    normalizationRuleVersion,
    isPLP: encrypted.type.name === 'VarBinary' && encrypted.dataLength === MAX
  };

  return new Result(metadata, offset);
}

/**
 * Reads a `TYPE_INFO`.
 */
function readTypeInfo(buf: Buffer, offset: number, userType: number, flags: number): Result<Metadata> {
  let typeNumber;
  ({ offset, value: typeNumber } = readUInt8(buf, offset));

  const type: DataType = TYPE[typeNumber];
  if (!type) {
    throw new Error(`Unrecognised data type 0x${formatHex(typeNumber, 2)}`);
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: undefined,
        cryptoMetadata: undefined
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
        udtInfo: udtInfo,
        cryptoMetadata: undefined
      }, offset);
    }

    default:
      throw new Error(`Unrecognised type ${type.name}`);
  }
}

export { readCollation, readMetadata };

module.exports.readCollation = readCollation;
module.exports.readMetadata = readMetadata;
