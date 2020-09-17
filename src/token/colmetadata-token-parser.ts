import metadataParse, { Metadata } from '../metadata-parser';
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

function colMetadataParser(parser: Parser, options: InternalConnectionOptions, callback: (token: ColMetadataToken) => void) {
  parser.readUInt16LE((columnCount) => {
    readCEKTable(parser, options, (cekList?: CEKEntry[]) => {
      const columns: ColumnMetadata[] = [];

      let i = 0;
      function next(done: () => void) {
        if (i === columnCount) {
          return done();
        }

        readColumn(parser, options, i, cekList, (column) => {
          columns.push(column);

          i++;
          next(done);
        });
      }

      next(() => {
        callback(new ColMetadataToken(columns));
      });
    });
  });
}

export default colMetadataParser;
module.exports = colMetadataParser;
