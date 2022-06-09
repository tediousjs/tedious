import metadataParse, { Metadata, metadataParse_async } from '../metadata-parser';
import { CEKEntry } from '../always-encrypted/cek-entry';
import { CryptoMetadata } from '../always-encrypted/types';
import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';
import { ColMetadataToken } from './token';
export interface ColumnMetadata extends Metadata {
  /**
   * The column's name。
   */
  colName: string;
  tableName?: string | string[];
}
type cekTableEntryMetadata = {
  databaseId: number;
  cekId: number;
  cekVersion: number;
  cekMdVersion: Buffer;
}
function readTableName(parser: Parser, options: InternalConnectionOptions, metadata: Metadata, callback: (tableName?: string | string[]) => void) {
  if (metadata.type.hasTableName) {
    if (options.tdsVersion >= '7_2') {
      parser.readUInt8((numberOfTableNameParts) => {
        const tableName: string[] = [];
        let i = 0;
        function next(done: () => void) {
          if (numberOfTableNameParts === i) {
            return done();
          }
          parser.readUsVarChar((part) => {
            tableName.push(part);
            i++;
            next(done);
          });
        }
        next(() => {
          callback(tableName);
        });
      });
    } else {
      parser.readUsVarChar(callback);
    }
  } else {
    callback(undefined);
  }
}
function readColumnName(parser: Parser, options: InternalConnectionOptions, index: number, metadata: Metadata, callback: (colName: string) => void) {
  parser.readBVarChar((colName) => {
    if (options.columnNameReplacer) {
      callback(options.columnNameReplacer(colName, index, metadata));
    } else if (options.camelCaseColumns) {
      callback(colName.replace(/^[A-Z]/, function(s) {
        return s.toLowerCase();
      }));
    } else {
      callback(colName);
    }
  });
}
function readCryptoMetadataOrdinal(parser: Parser, cekList: CEKEntry[] | undefined, callback: (ordinal: number) => void) {
  if (cekList) {
    parser.readUInt16LE((ordinal) => {
      callback(ordinal);
    });
  } else {
    callback(0);
  }
}
function readCryptoMetadata(parser: Parser, metadata: Metadata, cekList: CEKEntry[] | undefined, options: InternalConnectionOptions, callback: (cryptoMetdata?: CryptoMetadata) => void) {
  if (options.serverSupportsColumnEncryption === true && 0x0800 === (metadata.flags & 0x0800)) {
    readCryptoMetadataOrdinal(parser, cekList, (ordinal) => {
      metadataParse(parser, options, (metadata) => {
        parser.readUInt8((algorithmId) => {
          readCustomEncryptionMetadata(parser, algorithmId, (algorithmName) => {
            parser.readUInt8((encryptionType) => {
              parser.readBuffer(1, (normalizationRuleVersion) => {
                callback({
                  cekEntry: cekList ? cekList[ordinal] : undefined,
                  ordinal,
                  cipherAlgorithmId: algorithmId,
                  cipherAlgorithmName: algorithmName,
                  encryptionType: encryptionType,
                  normalizationRuleVersion,
                  baseTypeInfo: metadata,
                });
              });
            });
          });
        });
      }, false);
    });
  } else {
    callback();
  }
}
function readCustomEncryptionMetadata(parser: Parser, algorithmId: number, callback: (algorithmName: string) => void) {
  if (algorithmId === 0) {
    parser.readUInt8((nameSize) => {
      parser.readBuffer(nameSize, (algorithmNameBuffer) => {
        const algorithmName = algorithmNameBuffer.toString('ucs2');
        callback(algorithmName);
      });
    });
  } else {
    callback('');
  }
}
function readColumn(parser: Parser, options: InternalConnectionOptions, index: number, cekList: CEKEntry[] | undefined, callback: (column: ColumnMetadata) => void) {
  metadataParse(parser, options, (metadata) => {
    readTableName(parser, options, metadata, (tableName) => {
      readCryptoMetadata(parser, metadata, cekList, options, (cryptoMetadata) => {
        if (cryptoMetadata && cryptoMetadata.baseTypeInfo) {
          cryptoMetadata.baseTypeInfo.flags = metadata.flags;
          metadata.collation = cryptoMetadata.baseTypeInfo.collation;
        }
        readColumnName(parser, options, index, metadata, (colName) => {
          callback({
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
          });
        });
      });
    });
  }, true);
}
function readCEKTable(parser: Parser, options: InternalConnectionOptions, callback: (cekList?: CEKEntry[]) => void) {
  if (options.serverSupportsColumnEncryption === true) {
    parser.readUInt16LE((tableSize) => {
      if (tableSize > 0) {
        const cekList: CEKEntry[] = [];
        let i = 0;
        function next(done: () => void) {
          if (i === tableSize) {
            return done();
          }
          readCEKTableEntry(parser, (cekEntry: CEKEntry) => {
            cekList.push(cekEntry);
            i++;
            next(done);
          });
        }
        next(() => {
          callback(cekList);
        });
      } else {
        callback();
      }
    });
  } else {
    return callback();
  }
}
function readCEKTableEntry(parser: Parser, callback: (cekEntry: CEKEntry) => void) {
  parser.readUInt32LE((databaseId) => {
    parser.readUInt32LE((cekId) => {
      parser.readUInt32LE((cekVersion) => {
        parser.readBuffer(8, (cekMdVersion) => {
          parser.readUInt8((cekValueCount) => {
            const cekEntry = new CEKEntry(cekValueCount);
            let i = 0;
            function next(done: () => void) {
              if (i === cekValueCount) {
                return done();
              }
              readCEKValue(parser, cekEntry, {
                databaseId,
                cekId,
                cekVersion,
                cekMdVersion,
              }, () => {
                i++;
                next(done);
              });
            }
            next(() => {
              callback(cekEntry);
            });
          });
        });
      });
    });
  });
}

function readCEKValue(parser: Parser, cekEntry: CEKEntry, cekTableEntryMetadata: cekTableEntryMetadata, callback: () => void) {
  parser.readUInt16LE((encryptedCEKLength) => {
    parser.readBuffer(encryptedCEKLength, (encryptedCEK) => {
      parser.readUInt8((keyStoreNameLength) => {
        parser.readBuffer(2 * keyStoreNameLength, (keyStoreNameBuffer) => {
          const keyStoreName = keyStoreNameBuffer.toString('ucs2');
          parser.readUInt8((keyPathLength) => {
            parser.readBuffer(2 * keyPathLength, (keyPathBuffer) => {
              const keyPath = keyPathBuffer.swap16().toString('ucs2');
              parser.readUInt16BE((algorithmNameLength) => {
                parser.readBuffer(2 * algorithmNameLength, (algorithmNameBuffer) => {
                  const algorithmName = algorithmNameBuffer.toString('ucs2');
                  cekEntry.add(encryptedCEK, cekTableEntryMetadata.databaseId, cekTableEntryMetadata.cekId, cekTableEntryMetadata.cekVersion, cekTableEntryMetadata.cekMdVersion, keyPath, keyStoreName, algorithmName);
                  callback();
                });
              });
            });
          });
        });
      });
    });
  });
}
async function colMetadataParser(parser: Parser): Promise<ColMetadataToken> {
  while (parser.buffer.length - parser.position < 2) {
    await parser.streamBuffer.waitForChunk();
  }
  const columnCount = parser.buffer.readUInt16LE(parser.position);
  parser.position += 2;
  // let cekList: CEKEntry[] | undefined;

  // readCEKTable(parser, parser.options, (c?: CEKEntry[]) => { cekList = c; });
  const cekList = await readCEKTable_async(parser, parser.options);

  while (parser.suspended) {
    await parser.streamBuffer.waitForChunk();
    parser.suspended = false;
    const next = parser.next!;
    next();
  }

  const columns: ColumnMetadata[] = [];
  for (let i = 0; i < columnCount; i++) {
    const column = await readColumn_async(parser, parser.options, i, cekList);
    while (parser.suspended) {
      await parser.streamBuffer.waitForChunk();
      parser.suspended = false;
      const next = parser.next!;
      next();
    }
    columns.push(column!);
  }
  return new ColMetadataToken(columns);
}

// ---------- Remove Callbacks --------------
async function readCEKTable_async(parser: Parser, options: InternalConnectionOptions) {
  const cekList: CEKEntry[] = [];
  if (options.serverSupportsColumnEncryption === true) {
    const tableSize = await parser.readUInt16LE_async();
    if (tableSize > 0) {
      let i = 0;
      while (i < tableSize) {
        const cekEntry = await readCEKTableEntry_async(parser);
        cekList.push(cekEntry);
        i++;
      }
    }
  }
  return cekList;
}


async function readCEKTableEntry_async(parser: Parser): Promise<CEKEntry> {
  const databaseId = await parser.readUInt32LE_async();
  const cekId = await parser.readUInt32LE_async();
  const cekVersion = await parser.readUInt32LE_async();
  const cekMdVersion = await parser.readBuffer_async(8);
  const cekValueCount = await parser.readUInt8_async();
  const cekEntry = new CEKEntry(cekValueCount);
  let i = 0;
  while (i < cekValueCount) {
    readCEKValue_async(parser, cekEntry, {
      databaseId,
      cekId,
      cekVersion,
      cekMdVersion,
    });
    i++;
  }
  return cekEntry;
}

async function readCEKValue_async(parser: Parser, cekEntry: CEKEntry, cekTableEntryMetadata: cekTableEntryMetadata): Promise<void> {
  const encryptedCEKLength = await parser.readUInt16LE_async();
  const encryptedCEK = await parser.readBuffer_async(encryptedCEKLength);

  const keyStoreNameLength = await parser.readUInt8_async();
  const keyStoreNameBuffer = await parser.readBuffer_async(2 * keyStoreNameLength);
  const keyStoreName = keyStoreNameBuffer.toString('ucs2');

  const keyPathLength = await parser.readUInt8_async();
  const keyPathBuffer = await parser.readBuffer_async(2 * keyPathLength);
  const keyPath = keyPathBuffer.swap16().toString('ucs2');

  const algorithmNameLength = await parser.readUInt16BE_async();
  const algorithmNameBuffer = await parser.readBuffer_async(2 * algorithmNameLength);
  const algorithmName = algorithmNameBuffer.toString('ucs2');
  cekEntry.add(encryptedCEK, cekTableEntryMetadata.databaseId, cekTableEntryMetadata.cekId, cekTableEntryMetadata.cekVersion, cekTableEntryMetadata.cekMdVersion, keyPath, keyStoreName, algorithmName);
}

async function readColumn_async(parser: Parser, options: InternalConnectionOptions, index: number, cekList: CEKEntry[] | undefined): Promise<ColumnMetadata> {
  const metadata = await metadataParse_async(parser, options, true);
  const tableName = await readTableName_async(parser, options, metadata);
  const cryptoMetadata = await readCryptoMetadata_async(parser, metadata, cekList, options);
  if (cryptoMetadata && cryptoMetadata.baseTypeInfo) {
    cryptoMetadata.baseTypeInfo.flags = metadata.flags;
    metadata.collation = cryptoMetadata.baseTypeInfo.collation;
  }
  const colName = await readColumnName_async(parser, options, index, metadata);

  return {
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
  };
}

async function readTableName_async(parser: Parser, options: InternalConnectionOptions, metadata: Metadata): Promise<string | string[] | undefined> {
  if (metadata.type.hasTableName) {
    if (options.tdsVersion >= '7_2') {
      const numberOfTableNameParts = await parser.readUInt8_async();
      const tableName: string[] = [];
      let i = 0;
      while (i < numberOfTableNameParts) {
        const part = await parser.readUsVarChar_async();
        tableName.push(part);
        i++;
      }
      return tableName;
    } else {
      const tableName = await parser.readUsVarChar_async();
      return tableName;
    }
  } else {
    return undefined;
  }
}

async function readCryptoMetadata_async(parser: Parser, metadata: Metadata, cekList: CEKEntry[] | undefined, options: InternalConnectionOptions/* , callback: (cryptoMetdata?: CryptoMetadata) => void */): Promise<CryptoMetadata | undefined> {
  if (options.serverSupportsColumnEncryption === true && 0x0800 === (metadata.flags & 0x0800)) {
    const ordinal = await readCryptoMetadataOrdinal_async(parser, cekList);
    const metadata = await metadataParse_async(parser, options, false);
    const algorithmId = await parser.readUInt8_async();
    const algorithmName = await readCustomEncryptionMetadata_async(parser, algorithmId);
    const encryptionType = await parser.readUInt8_async();
    const normalizationRuleVersion = await parser.readBuffer_async(1);
    return {
      cekEntry: cekList ? cekList[ordinal] : undefined,
      ordinal,
      cipherAlgorithmId: algorithmId,
      cipherAlgorithmName: algorithmName,
      encryptionType: encryptionType,
      normalizationRuleVersion,
      baseTypeInfo: metadata,
    };
  }
}

async function readCryptoMetadataOrdinal_async(parser: Parser, cekList: CEKEntry[] | undefined): Promise<number> {
  if (cekList) {
    const ordinal = await parser.readUInt16LE_async();
    return ordinal;
  } else {
    return 0;
  }
}

async function readCustomEncryptionMetadata_async(parser: Parser, algorithmId: number): Promise<string> {
  if (algorithmId === 0) {
    const nameSize = await parser.readUInt8_async();
    const algorithmNameBuffer = await parser.readBuffer_async(nameSize);
    const algorithmName = algorithmNameBuffer.toString('ucs2');
    return algorithmName;
  } else {
    return '';
  }
}

async function readColumnName_async(parser: Parser, options: InternalConnectionOptions, index: number, metadata: Metadata): Promise<string> {
  const colName = await parser.readBVarChar_async();
  if (options.columnNameReplacer) {
    return options.columnNameReplacer(colName, index, metadata);
  } else if (options.camelCaseColumns) {
    return colName.replace(/^[A-Z]/, function(s) {
      return s.toLowerCase();
    });
  } else {
    return colName;
  }
}

export default colMetadataParser;
module.exports = colMetadataParser;
