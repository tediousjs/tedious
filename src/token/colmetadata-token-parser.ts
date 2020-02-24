import metadataParse, { Metadata, metadataParseCrypto } from '../metadata-parser';

import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';
import { ColMetadataToken } from './token';
import { CryptoMetadata, EncryptionKeyInfo } from '../always-encrypted';

export type ColumnMetadata = Metadata & {
  colName: string;
  tableName?: string | string[];
};

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

function readColumn(parser: Parser, options: InternalConnectionOptions, index: number, columnEncryptionKeys: EncryptionKeyInfo[][] | undefined, callback: (column: ColumnMetadata) => void) {
  metadataParse(parser, options, (metadata) => {
    readTableName(parser, options, metadata, (tableName) => {
      readCryptoMetadata(parser, metadata, columnEncryptionKeys, options, (cryptoMetadata) => {
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
            cryptoMetadata: cryptoMetadata,
          });
        });
      });
    });
  });
}

function readCryptoMetadata(parser: Parser, metadata: Metadata, columnEncryptionKeyTables: EncryptionKeyInfo[][] | undefined, options: InternalConnectionOptions, callback: (cryptoMetadata?: CryptoMetadata) => void) {
  if (options.serverSupportsColumnEncryption !== true || 0x0800 !== (metadata.flags & 0x0800)) {
    return callback();
  }

  // 2.2.7.4 COLMETADATA
  readCryptoMetadataOrdinal(parser, columnEncryptionKeyTables, (ordinal) => {
    metadataParseCrypto(parser, options, (baseTypeMetadata) => {
      parser.readUInt8((cipherAlgorithmId) => {
        readCustomEncryptionMetadata(parser, cipherAlgorithmId, (cipherAlgorithmName) => {
          parser.readUInt8((encryptionType) => {
            parser.readBuffer(1, (normalizationRuleVersion) => {
              callback({
                ordinal,
                cipherAlgorithmId,
                cipherAlgorithmName,
                encryptionType,
                normalizationRuleVersion,
                baseTypeInfo: baseTypeMetadata,
                encryptionKeys: columnEncryptionKeyTables ? columnEncryptionKeyTables[ordinal] : undefined,
              });
            });
          });
        });
      });
    });
  });
}

function readCustomEncryptionMetadata(parser: Parser, cipherAlgorithmId: number, callback: (cipherAlgorithmName?: string) => void) {
  // 2.2.6.6 RPC Request
  // This byte describes the encryption algorithm that is used. For a custom encryption algorithm,
  // the EncryptionAlgo value MUST be set to 0 and the actual encryption algorithm MUST be
  // inferred from the AlgoName. For all other values, AlgoName MUST NOT be sent.
  // If the value is set to 1, the encryption algorithm that is used is
  // AEAD_AES_256_CBC_HMAC_SHA512
  if (cipherAlgorithmId !== 0) {
    return callback();
  }

  parser.readUInt8((nameSize) => {
    parser.readBuffer(nameSize, (algorithmNameBuffer) => {
      callback(algorithmNameBuffer.toString('ucs2'));
    });
  });
}

function readCryptoMetadataOrdinal(parser: Parser, columnEncryptionKeys: EncryptionKeyInfo[][] | undefined, callback: (ordinal: number) => void) {
  if (!columnEncryptionKeys) {
    // Ordinal is not provided for SQL function return values
    callback(0);
  } else {
    parser.readUInt16LE((ordinal) => {
      callback(ordinal);
    });
  }
}

function readEncryptedCEK(parser: Parser, callback: (encryptedCEK: Buffer) => void) {
  parser.readUInt16LE((encryptedCEKLength) => {
    parser.readBuffer(encryptedCEKLength, (encryptedCEK) => {
      callback(encryptedCEK);
    });
  });
}

function readKeyStoreName(parser: Parser, callback: (keyStoreName: string) => void) {
  parser.readUInt8((keyStoreNameLength) => {
    parser.readBuffer(2 * keyStoreNameLength, (keyStoreNameBuffer) => {
      callback(keyStoreNameBuffer.toString('ucs2'));
    });
  });
}

function readKeyPath(parser: Parser, callback: (keyPath: string) => void) {
  parser.readUInt8((keyPathLength) => {
    parser.readBuffer(2 * keyPathLength, (keyPathBuffer) => {
      callback(keyPathBuffer.swap16().toString('ucs2'));
    });
  });
}

function readAlgorithmName(parser: Parser, callback: (algorithmName: string) => void) {
  parser.readUInt16BE((algorithmNameLength) => {
    parser.readBuffer(2 * algorithmNameLength, (algorithmNameBuffer) => {
      callback(algorithmNameBuffer.toString('ucs2'));
    });
  });
}

// readCEKValue
function readColumnEncryptionKeyValue(parser: Parser, callback: (keyInfo: Pick<EncryptionKeyInfo, 'encryptedKey' | 'keyStoreName' | 'keyPath' | 'algorithmName'>) => void) {
  readEncryptedCEK(parser, (encryptedKey) => {
    readKeyStoreName(parser, (keyStoreName) => {
      readKeyPath(parser, (keyPath) => {
        readAlgorithmName(parser, (algorithmName) => {
          callback({
            encryptedKey,
            keyPath,
            keyStoreName,
            algorithmName,
          });
        });
      });
    });
  });
}

function readEncryptionKeyValues(parser: Parser, callback: (columnEncryptionKeyTable: EncryptionKeyInfo[]) => void) {
  parser.readUInt32LE((databaseId) => {
    parser.readUInt32LE((keyId) => {
      parser.readUInt32LE((keyVersion) => {
        parser.readBuffer(8, (mdVersion) => {
          parser.readUInt8((numberOfKeys) => {
            const encryptionKeyInfoTable: EncryptionKeyInfo[] = [];

            function next(done: () => void) {
              if (encryptionKeyInfoTable.length === numberOfKeys) {
                return done();
              }

              readColumnEncryptionKeyValue(parser, (keyInfo) => {
                encryptionKeyInfoTable.push({
                  ...keyInfo,
                  databaseId,
                  keyId,
                  keyVersion,
                  mdVersion,
                });
                next(done);
              });
            }

            next(() => {
              callback(encryptionKeyInfoTable);
            });
          });
        });
      });
    });
  });
}

function readEncryptionKeyInfo(parser: Parser, options: InternalConnectionOptions, callback: (encryptionKeyInfoTables?: EncryptionKeyInfo[][]) => void) {
  if (options.serverSupportsColumnEncryption !== true) {
    return callback();
  }
  // 2.2.5.7 Encryption Key Rule Definition
  parser.readUInt16LE((numberOfEntries) => {
    if (numberOfEntries > 0) {
      const entries: EncryptionKeyInfo[][] = [];

      function next(done: () => void) {
        if (entries.length === numberOfEntries) {
          return done();
        }

        readEncryptionKeyValues(parser, (columnEncryptionKeyValues) => {
          entries.push(columnEncryptionKeyValues);
          next(done);
        });
      }

      next(() => {
        callback(entries);
      });
    } else {
      callback();
    }
  });
}

function colMetadataParser(parser: Parser, _colMetadata: ColumnMetadata[], options: InternalConnectionOptions, callback: (token: ColMetadataToken) => void) {
  parser.readUInt16LE((columnCount) => {
    readEncryptionKeyInfo(parser, options, (columnEncryptionKeys) => {
      const columns: ColumnMetadata[] = [];

      let i = 0;
      function next(done: () => void) {
        if (i === columnCount) {
          return done();
        }

        readColumn(parser, options, i, columnEncryptionKeys, (column) => {
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
