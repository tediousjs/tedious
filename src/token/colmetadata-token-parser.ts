import { readMetadata, type Metadata } from '../metadata-parser';
import { CEKEntry } from '../always-encrypted/cek-entry';
import { type CryptoMetadata, type EncryptionKeyInfo } from '../always-encrypted/types';
import Parser, { type ParserOptions } from './stream-parser';
import { ColMetadataToken } from './token';
import { NotEnoughDataError, Result, readBVarChar, readUInt16LE, readUInt8, readUsVarChar, readUInt16BE, readUInt32LE } from './helpers';

export interface ColumnMetadata extends Metadata {
  /**
   * The column's name。
   */
  colName: string;

  tableName?: string | string[] | undefined;
}

type cekTableEntryMetadata = {
  databaseId: number;
  cekId: number;
  cekVersion: number;
  cekMdVersion: Buffer;
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

async function readCEKTable(parser: Parser): Promise<Result<CEKEntry[] | undefined>> {

  let tableSize;

  while (true) {
    let offset;

    try {
      ({ offset, value: tableSize } = readUInt16LE(parser.buffer, parser.position));
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
  if (tableSize > 0) {
    const cekEntries: CEKEntry[] = [];
    for (let i = 0; i < tableSize; i++) {
      while (true) {
        let cek: CEKEntry;
        let offset;
        try {
          ({ offset, value: cek } = await readCEKTableEntry(parser));
        } catch (err: any) {
          if (err instanceof NotEnoughDataError) {
            await parser.waitForChunk();
            continue;
          }

          throw err;
        }

        parser.position = offset;
        cekEntries.push(cek);

        break;
      }
    }
    return new Result(cekEntries, parser.position);
  }
  return new Result(undefined, parser.position);
}


async function readCEKTableEntry(parser: Parser): Promise<Result<CEKEntry>> {
  let databaseId;
  let cekId;
  let cekVersion;
  let cekMdVersion;
  let cekValueCount;

  while (true) {
    let offset = parser.position;
    try {
      ({ offset, value: databaseId } = readUInt32LE(parser.buffer, offset));
      ({ offset, value: cekId } = readUInt32LE(parser.buffer, offset));
      ({ offset, value: cekVersion } = readUInt32LE(parser.buffer, offset));
      cekMdVersion = parser.buffer.subarray(offset, offset + 8);
      ({ offset, value: cekValueCount } = readUInt8(parser.buffer, offset + 8));
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

  const cekEntry = new CEKEntry(cekValueCount);
  for (let i = 0; i < cekValueCount; i++) {
    while (true) {
      let cekValue;
      let offset;
      try {
        ({ offset, value: cekValue } = readCEKValue(parser.buffer, parser.position, {
          databaseId: databaseId,
          cekId: cekId,
          cekVersion: cekVersion,
          cekMdVersion: cekMdVersion
        }));
      } catch (err: any) {
        if (err instanceof NotEnoughDataError) {
          await parser.waitForChunk();
          continue;
        }

        throw err;
      }

      parser.position = offset;
      cekEntry.addEntry(cekValue);

      break;
    }
  }
  return new Result(cekEntry, parser.position);
}

function readCEKValue(buf: Buffer, offset: number, cekTableEntryMetadata: cekTableEntryMetadata,): Result<EncryptionKeyInfo> {
  let encryptedCEKLength;
  ({ offset, value: encryptedCEKLength } = readUInt16LE(buf, offset));

  const encryptedCEK = buf.subarray(offset, offset + encryptedCEKLength);

  let keyStoreNameLength;
  ({ offset, value: keyStoreNameLength } = readUInt8(buf, offset + encryptedCEKLength));

  const keyStoreName = buf.toString('ucs2', offset, offset + 2 * keyStoreNameLength);

  let keyPathLength;
  ({ offset, value: keyPathLength } = readUInt8(buf, offset + 2 * keyStoreNameLength));

  const keyPath = buf.subarray(offset, offset + 2 * keyPathLength).swap16().toString('ucs2');

  let algorithmNameLength;
  ({ offset, value: algorithmNameLength } = readUInt16BE(buf, offset + 2 * keyPathLength));

  const algorithmName = buf.toString('ucs2', offset, offset + 2 * algorithmNameLength);

  return new Result({
    encryptedKey: encryptedCEK,
    dbId: cekTableEntryMetadata.databaseId,
    keyId: cekTableEntryMetadata.cekId,
    keyVersion: cekTableEntryMetadata.cekVersion,
    mdVersion: cekTableEntryMetadata.cekMdVersion,
    keyPath: keyPath,
    keyStoreName: keyStoreName,
    algorithmName: algorithmName }, offset + 2 * algorithmNameLength);
}

function readCryptoMetadata(buf: Buffer, offset: number, metadata: Metadata, cekList: CEKEntry[] | undefined, options: ParserOptions): Result<CryptoMetadata> {
  let ordinal;
  cekList ? { offset, value: ordinal } = readUInt16LE(buf, offset) : ordinal = 0;

  ({ offset, value: metadata } = readMetadata(buf, offset, options, false));

  let algorithmId;
  ({ offset, value: algorithmId } = readUInt8(buf, offset));

  let algorithmName;
  ({ offset, value: algorithmName } = readCustomEncryptionMetadata(buf, offset, algorithmId));

  let encryptionType;
  ({ offset, value: encryptionType } = readUInt8(buf, offset));

  const normalizationRuleVersion = buf.subarray(offset, offset + 1);

  return new Result({
    cekEntry: cekList ? cekList[ordinal] : undefined,
    ordinal: ordinal,
    cipherAlgorithmId: algorithmId,
    cipherAlgorithmName: algorithmName,
    encryptionType: encryptionType,
    normalizationRuleVersion: normalizationRuleVersion,
    baseTypeInfo: metadata }, offset + 1);
}

function readCustomEncryptionMetadata(buf: Buffer, offset: number, algorithmId: number): Result<string> {
  if (algorithmId === 0) {
    let nameSize;
    ({ offset, value: nameSize } = readUInt8(buf, offset));
    const algorithmName = buf.toString('ucs2', offset, offset + nameSize);
    return new Result(algorithmName, offset + nameSize);
  }
  return new Result('', offset);
}

function readColumn(buf: Buffer, offset: number, options: ParserOptions, index: number, cekList: CEKEntry[] | undefined): Result<ColumnMetadata> {
  let metadata;
  ({ offset, value: metadata } = readMetadata(buf, offset, options, true));

  let tableName;
  ({ offset, value: tableName } = readTableName(buf, offset, metadata, options));

  let cryptoMetadata;
  if (options.serverSupportsColumnEncryption === true && 0x0800 === (metadata.flags & 0x0800)) {
    ({ offset, value: cryptoMetadata } = readCryptoMetadata(buf, offset, metadata, cekList, options));
    if (cryptoMetadata && cryptoMetadata.baseTypeInfo) {
      cryptoMetadata.baseTypeInfo.flags = metadata.flags;
      metadata.collation = cryptoMetadata.baseTypeInfo.collation;
    }
  }

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
    colName: colName,
    tableName: tableName,
    cryptoMetadata: options.serverSupportsColumnEncryption === true ? cryptoMetadata : undefined,
  }, offset);
}

async function colMetadataParser(parser: Parser): Promise<ColMetadataToken> {
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

  let cekList;
  if (parser.options.serverSupportsColumnEncryption === true) {
    while (true) {
      let offset;

      try {
        ({ offset, value: cekList } = await readCEKTable(parser));
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
  }

  const columns: ColumnMetadata[] = [];
  for (let i = 0; i < columnCount; i++) {
    while (true) {
      let column: ColumnMetadata;
      let offset;

      try {
        ({ offset, value: column } = readColumn(parser.buffer, parser.position, parser.options, i, cekList));
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
