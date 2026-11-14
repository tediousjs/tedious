import { readMetadata, type Metadata } from '../metadata-parser';

import Parser, { type ParserOptions, type TokenReader } from './stream-parser';
import { ColMetadataToken } from './token';
import { NotEnoughDataError, Result, readBVarChar, readUInt16LE, readUInt32LE, readUInt8, readUsVarChar } from './helpers';
import { type ColumnEncryptionKeyInfo, type EncryptedColumnEncryptionKey } from '../always-encrypted/types';

export interface ColumnMetadata extends Metadata {
  /**
   * The column's name。
   */
  colName: string;

  tableName?: string | string[] | undefined;
}

function readTableName(buf: Buffer, offset: number, metadata: Metadata, options: ParserOptions): Result<string | string[] | undefined> {
  if (!metadata.type.hasTableName) {
    return new Result(undefined, offset);
  }

  if (options.tdsVersion < '7_2') {
    return readUsVarChar(buf, offset);
  }

  let numberOfTableNameParts;
  ({ offset, value: numberOfTableNameParts } = readUInt8(buf, offset));

  const tableName: string[] = [];
  for (let i = 0; i < numberOfTableNameParts; i++) {
    let tableNamePart;
    ({ offset, value: tableNamePart } = readUsVarChar(buf, offset));

    tableName.push(tableNamePart);
  }

  return new Result(tableName, offset);
}

function readColumnName(buf: Buffer, offset: number, index: number, metadata: Metadata, options: ParserOptions): Result<string> {
  let colName;
  ({ offset, value: colName } = readBVarChar(buf, offset));

  if (options.columnNameReplacer) {
    return new Result(options.columnNameReplacer(colName, index, metadata), offset);
  } else if (options.camelCaseColumns) {
    return new Result(colName.replace(/^[A-Z]/, function(s) {
      return s.toLowerCase();
    }), offset);
  } else {
    return new Result(colName, offset);
  }
}

function readColumn(buf: Buffer, offset: number, options: ParserOptions, index: number, cekTable: ColumnEncryptionKeyInfo[] | undefined) {
  let metadata;
  ({ offset, value: metadata } = readMetadata(buf, offset, options, cekTable));

  let tableName;
  ({ offset, value: tableName } = readTableName(buf, offset, metadata, options));

  let colName;
  ({ offset, value: colName } = readColumnName(buf, offset, index, metadata, options));

  return new Result({
    userType: metadata.userType,
    flags: metadata.flags,
    type: metadata.type,
    collation: metadata.collation,
    precision: metadata.precision,
    scale: metadata.scale,
    udtInfo: metadata.udtInfo,
    dataLength: metadata.dataLength,
    schema: metadata.schema,
    cryptoMetadata: metadata.cryptoMetadata,
    colName: colName,
    tableName: tableName
  }, offset);
}

/**
 * Reads an entry of the table of column encryption keys (`EK_INFO`) that
 * precedes the columns if column encryption was negotiated.
 */
function readColumnEncryptionKey(buf: Buffer, offset: number): Result<ColumnEncryptionKeyInfo> {
  let databaseId;
  ({ offset, value: databaseId } = readUInt32LE(buf, offset));

  let keyId;
  ({ offset, value: keyId } = readUInt32LE(buf, offset));

  let keyVersion;
  ({ offset, value: keyVersion } = readUInt32LE(buf, offset));

  if (buf.length < offset + 8) {
    throw new NotEnoughDataError(offset + 8);
  }

  const metadataVersion = Buffer.from(buf.subarray(offset, offset + 8));
  offset += 8;

  let valueCount;
  ({ offset, value: valueCount } = readUInt8(buf, offset));

  const values: EncryptedColumnEncryptionKey[] = [];
  for (let i = 0; i < valueCount; i++) {
    let encryptedKeyLength;
    ({ offset, value: encryptedKeyLength } = readUInt16LE(buf, offset));

    if (buf.length < offset + encryptedKeyLength) {
      throw new NotEnoughDataError(offset + encryptedKeyLength);
    }

    // Copied, as the key outlives the incoming data it is part of.
    const encryptedKey = Buffer.from(buf.subarray(offset, offset + encryptedKeyLength));
    offset += encryptedKeyLength;

    let keyStoreName;
    ({ offset, value: keyStoreName } = readBVarChar(buf, offset));

    let keyPath;
    ({ offset, value: keyPath } = readUsVarChar(buf, offset));

    let algorithm;
    ({ offset, value: algorithm } = readBVarChar(buf, offset));

    values.push({ encryptedKey, keyStoreName, keyPath, algorithm });
  }

  return new Result({ databaseId, keyId, keyVersion, metadataVersion, values, cipher: undefined }, offset);
}

/**
 * Reads a `COLMETADATA` token column by column, so that tokens describing many
 * columns are not parsed again from the start whenever they span chunks.
 */
export class ColMetadataTokenReader implements TokenReader {
  declare columnCount: number | undefined;
  declare columns: ColumnMetadata[];

  // The table of column encryption keys, which is only sent if column
  // encryption was negotiated.
  declare keyCount: number | undefined;
  declare keys: ColumnEncryptionKeyInfo[];

  constructor() {
    this.columnCount = undefined;
    this.columns = [];

    this.keyCount = undefined;
    this.keys = [];
  }

  read(parser: Parser): ColMetadataToken {
    if (this.columnCount === undefined) {
      const { value, offset } = readUInt16LE(parser.buffer, parser.position);
      parser.position = offset;
      this.columnCount = value;
    }

    const hasCekTable = parser.options.serverSupportsColumnEncryption === true;
    if (hasCekTable) {
      if (this.keyCount === undefined) {
        const { value, offset } = readUInt16LE(parser.buffer, parser.position);
        parser.position = offset;
        this.keyCount = value;
      }

      while (this.keys.length < this.keyCount) {
        const { value, offset } = readColumnEncryptionKey(parser.buffer, parser.position);
        parser.position = offset;
        this.keys.push(value);
      }
    }

    while (this.columns.length < this.columnCount) {
      const { value, offset } = readColumn(parser.buffer, parser.position, parser.options, this.columns.length, hasCekTable ? this.keys : undefined);
      parser.position = offset;
      this.columns.push(value);
    }

    parser.colMetadata = this.columns;

    // The keys are only of use if the columns are going to be decrypted.
    const decrypt = this.keys.length > 0 && parser.options.columnEncryption !== undefined;
    return new ColMetadataToken(this.columns, decrypt ? this.keys : undefined);
  }
}
