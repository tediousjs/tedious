import { readMetadata, type Metadata } from '../metadata-parser';
import { type CryptoMetadata } from '../always-encrypted/types';
import { CEKEntry } from '../always-encrypted/cek-entry';

import Parser, { type ParserOptions } from './stream-parser';
import { ColMetadataToken } from './token';
import { NotEnoughDataError, Result, readBVarChar, readUInt16LE, readUInt32LE, readUInt8, readUsVarChar, readUsVarByte } from './helpers';

export interface ColumnMetadata extends Metadata {
  /**
   * The column's name.
   */
  colName: string;

  tableName?: string | string[] | undefined;

  /**
   * The column's encryption metadata, if the column is encrypted.
   */
  cryptoMetadata?: CryptoMetadata;
}

/**
 * Reads the CekTable (Column Encryption Key Table) from the COLMETADATA token.
 * This table contains encryption key information used by encrypted columns.
 *
 * Structure per MS-TDS spec:
 * - EkValueCount (USHORT): Number of CEK entries
 * - For each CEK entry (EK_INFO):
 *   - DatabaseId (ULONG)
 *   - CekId (ULONG)
 *   - CekVersion (ULONG)
 *   - CekMdVersion (8 bytes)
 *   - Count (BYTE): Number of encrypted key values
 *   - For each EncryptionKeyValue:
 *     - EncryptedKey (USHORTLEN bytes)
 *     - KeyStoreName (B_VARCHAR)
 *     - KeyPath (B_VARCHAR)
 *     - AsymmetricAlgo (B_VARCHAR)
 */
function readCekTable(buf: Buffer, offset: number): Result<CEKEntry[]> {
  const cekTable: CEKEntry[] = [];

  let tableSize: number;
  ({ offset, value: tableSize } = readUInt16LE(buf, offset));

  for (let i = 0; i < tableSize; i++) {
    const cekEntry = new CEKEntry(i);

    // DatabaseId (4 bytes)
    let databaseId: number;
    ({ offset, value: databaseId } = readUInt32LE(buf, offset));

    // CekId (4 bytes)
    let cekId: number;
    ({ offset, value: cekId } = readUInt32LE(buf, offset));

    // CekVersion (4 bytes)
    let cekVersion: number;
    ({ offset, value: cekVersion } = readUInt32LE(buf, offset));

    // CekMdVersion (8 bytes)
    if (buf.length < offset + 8) {
      throw new NotEnoughDataError(offset + 8);
    }
    const cekMdVersion = buf.slice(offset, offset + 8);
    offset += 8;

    // Count of EncryptionKeyValue entries
    let ekValueCount: number;
    ({ offset, value: ekValueCount } = readUInt8(buf, offset));

    for (let j = 0; j < ekValueCount; j++) {
      // EncryptedKey (USHORTLEN bytes)
      let encryptedKey: Buffer;
      ({ offset, value: encryptedKey } = readUsVarByte(buf, offset));

      // KeyStoreName (B_VARCHAR)
      let keyStoreName: string;
      ({ offset, value: keyStoreName } = readBVarChar(buf, offset));

      // KeyPath (B_VARCHAR)
      let keyPath: string;
      ({ offset, value: keyPath } = readBVarChar(buf, offset));

      // AsymmetricAlgo (B_VARCHAR)
      let algorithmName: string;
      ({ offset, value: algorithmName } = readBVarChar(buf, offset));

      cekEntry.add(
        encryptedKey,
        databaseId,
        cekId,
        cekVersion,
        cekMdVersion,
        keyPath,
        keyStoreName,
        algorithmName
      );
    }

    cekTable.push(cekEntry);
  }

  return new Result(cekTable, offset);
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

function readColumn(buf: Buffer, offset: number, options: ParserOptions, index: number, cekTable: CEKEntry[]) {
  let metadata;
  ({ offset, value: metadata } = readMetadata(buf, offset, options, cekTable));

  let tableName;
  ({ offset, value: tableName } = readTableName(buf, offset, metadata, options));

  let colName;
  ({ offset, value: colName } = readColumnName(buf, offset, index, metadata, options));

  const columnMetadata: ColumnMetadata = {
    userType: metadata.userType,
    flags: metadata.flags,
    type: metadata.type,
    collation: metadata.collation,
    precision: metadata.precision,
    scale: metadata.scale,
    udtInfo: metadata.udtInfo,
    dataLength: metadata.dataLength,
    schema: metadata.schema,
    colName: colName,
    tableName: tableName
  };

  // Only add cryptoMetadata if present (for encrypted columns)
  if (metadata.cryptoMetadata) {
    columnMetadata.cryptoMetadata = metadata.cryptoMetadata;
  }

  return new Result<ColumnMetadata>(columnMetadata, offset);
}

async function colMetadataParser(parser: Parser): Promise<ColMetadataToken> {
  // Parse column count first (per MS-TDS spec, Count comes before CekTable)
  let columnCount;
  while (true) {
    let offset;

    try {
      ({ offset, value: columnCount } = readUInt16LE(parser.buffer, parser.position));
    } catch (err) {
      if (err instanceof NotEnoughDataError) {
        await parser.waitForChunk();
        continue;
      }

      throw err;
    }

    parser.position = offset;
    break;
  }

  let cekTable: CEKEntry[] = [];
  if (columnCount > 0) {
    // Parse CekTable when server supports column encryption.
    //
    // Per MS-TDS spec and mssql-jdbc implementation:
    // "CEK table will be sent if AE is enabled. If none of the columns are encrypted,
    // the CEK table size would be zero."
    //
    // This means when COLUMNENCRYPTION is negotiated, the CekTable structure (starting with
    // the 2-byte tableSize) is ALWAYS present in COLMETADATA - it's just that tableSize = 0
    // when there are no encrypted columns.
    if (parser.options.serverSupportsColumnEncryption) {
      while (true) {
        try {
          const result = readCekTable(parser.buffer, parser.position);
          cekTable = result.value;
          parser.position = result.offset;
          break;
        } catch (err) {
          if (err instanceof NotEnoughDataError) {
            await parser.waitForChunk();
            continue;
          }
          throw err;
        }
      }
    }
  }

  // Parse each column
  const columns: ColumnMetadata[] = [];
  for (let i = 0; i < columnCount; i++) {
    while (true) {
      let column: ColumnMetadata;
      let offset;

      try {
        ({ offset, value: column } = readColumn(parser.buffer, parser.position, parser.options, i, cekTable));
      } catch (err: any) {
        if (err instanceof NotEnoughDataError) {
          await parser.waitForChunk();
          continue;
        }

        throw err;
      }

      parser.position = offset;
      columns.push(column);

      break;
    }
  }

  return new ColMetadataToken(columns);
}

export default colMetadataParser;
module.exports = colMetadataParser;
