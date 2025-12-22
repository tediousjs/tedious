import { assert } from 'chai';
import * as crypto from 'crypto';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { TYPES } from '../../src/data-type';
import { type ColumnMetadata } from '../../src/token/colmetadata-token-parser';
import { type KeyStoreProvider } from '../../src/always-encrypted/keystore-provider';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  const config = {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION
    }
  };

  return config;
}

// Test keystore provider for Always Encrypted integration tests
// This provider uses a simple AES-128-CBC encryption scheme for the CEK
// In production, you would use Azure Key Vault or certificate-based providers
const TEST_MASTER_KEY = Buffer.from('0123456789abcdef', 'utf8'); // 16 bytes for AES-128
const TEST_CEK = crypto.randomBytes(32); // 32 bytes for AES-256

/**
 * Creates an encrypted CEK value that can be stored in SQL Server.
 * The format is: version (1) + iv (16) + encrypted_cek (48 with padding)
 */
function encryptCekForTest(cek: Buffer): Buffer {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', TEST_MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(cek), cipher.final()]);
  // Format: version (1 byte) + iv (16 bytes) + encrypted data
  return Buffer.concat([Buffer.from([0x01]), iv, encrypted]);
}

/**
 * Decrypts a CEK that was encrypted with our test format.
 */
function decryptCekForTest(encryptedCek: Buffer): Buffer {
  // Skip version byte
  const iv = encryptedCek.slice(1, 17);
  const encrypted = encryptedCek.slice(17);
  const decipher = crypto.createDecipheriv('aes-128-cbc', TEST_MASTER_KEY, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// Pre-encrypt the test CEK for SQL Server storage
const ENCRYPTED_CEK_VALUE = encryptCekForTest(TEST_CEK);

/**
 * Test keystore provider that decrypts CEKs using our test encryption scheme.
 */
class TestKeyStoreProvider implements KeyStoreProvider {
  readonly name = 'TEST_KEYSTORE';

  async decryptColumnEncryptionKey(
    masterKeyPath: string,
    encryptionAlgorithm: string,
    encryptedCek: Buffer
  ): Promise<Buffer> {
    // Validate the master key path
    if (masterKeyPath !== 'test-cmk-path') {
      throw new Error(`Unknown master key path: ${masterKeyPath}`);
    }

    // Decrypt the CEK using our test format
    return decryptCekForTest(encryptedCek);
  }

  async encryptColumnEncryptionKey(
    masterKeyPath: string,
    encryptionAlgorithm: string,
    cek: Buffer
  ): Promise<Buffer> {
    if (masterKeyPath !== 'test-cmk-path') {
      throw new Error(`Unknown master key path: ${masterKeyPath}`);
    }
    return encryptCekForTest(cek);
  }
}

describe('Always Encrypted', function() {
  describe('Feature Negotiation', function() {
    it('should negotiate COLUMNENCRYPTION feature when alwaysEncrypted is enabled', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;

      const connection = new Connection(config);
      let isDone = false;

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.on('end', function() {
        if (!isDone) {
          isDone = true;
          done();
        }
      });

      connection.connect(function(err) {
        if (err) {
          if (!isDone) {
            isDone = true;
            return done(err);
          }
          return;
        }

        // Server should acknowledge column encryption support
        assert.isBoolean(connection.serverSupportsColumnEncryption);

        connection.close();
      });
    });

    it('should not request COLUMNENCRYPTION feature when alwaysEncrypted is disabled', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = false;

      const connection = new Connection(config);
      let isDone = false;

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.on('end', function() {
        if (!isDone) {
          isDone = true;
          done();
        }
      });

      connection.connect(function(err) {
        if (err) {
          if (!isDone) {
            isDone = true;
            return done(err);
          }
          return;
        }

        assert.strictEqual(connection.serverSupportsColumnEncryption, false);

        connection.close();
      });
    });

    it('should execute simple query with alwaysEncrypted enabled', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;

      const connection = new Connection(config);
      let isDone = false;

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.on('end', function() {
        if (!isDone) {
          isDone = true;
          done();
        }
      });

      connection.connect(function(err) {
        if (err) {
          isDone = true;
          return done(err);
        }

        let rowCount = 0;

        const request = new Request('SELECT 1 as test_value', function(err) {
          if (err) {
            isDone = true;
            done(err);
            return connection.close();
          }

          assert.strictEqual(rowCount, 1, 'Should receive exactly one row');
          connection.close();
        });

        request.on('row', function(columns) {
          rowCount++;
          assert.strictEqual(columns[0].value, 1);
        });

        connection.execSql(request);
      });
    });
  });

  describe('Configuration Validation', function() {
    it('should validate encryptionKeyStoreProviders is an array', function() {
      const config = getConfig();
      config.options.alwaysEncrypted = true;
      (config.options as any).encryptionKeyStoreProviders = 'not-an-array';

      assert.throws(() => {
        new Connection(config);
      }, TypeError);
    });

    it('should validate provider has required properties', function() {
      const config = getConfig();
      config.options.alwaysEncrypted = true;
      (config.options as any).encryptionKeyStoreProviders = [
        { name: 'TEST_PROVIDER' } // missing decryptColumnEncryptionKey
      ];

      assert.throws(() => {
        new Connection(config);
      }, TypeError);
    });

    it('should accept valid provider configuration', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;
      config.options.encryptionKeyStoreProviders = [
        {
          name: 'TEST_PROVIDER',
          decryptColumnEncryptionKey: async () => Buffer.alloc(32)
        }
      ];

      const connection = new Connection(config);
      let isDone = false;

      connection.on('end', function() {
        if (!isDone) {
          isDone = true;
          done();
        }
      });

      connection.connect(function(err) {
        if (err) {
          if (!isDone) {
            isDone = true;
            return done(err);
          }
          return;
        }

        assert.isObject(connection.config.options.encryptionKeyStoreProviders);
        assert.property(connection.config.options.encryptionKeyStoreProviders!, 'TEST_PROVIDER');

        connection.close();
      });
    });

    it('should accept multiple providers', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;
      config.options.encryptionKeyStoreProviders = [
        {
          name: 'PROVIDER_1',
          decryptColumnEncryptionKey: async () => Buffer.alloc(32)
        },
        {
          name: 'PROVIDER_2',
          decryptColumnEncryptionKey: async () => Buffer.alloc(32)
        }
      ];

      const connection = new Connection(config);
      let isDone = false;

      connection.on('end', function() {
        if (!isDone) {
          isDone = true;
          done();
        }
      });

      connection.connect(function(err) {
        if (err) {
          if (!isDone) {
            isDone = true;
            return done(err);
          }
          return;
        }

        const providers = connection.config.options.encryptionKeyStoreProviders;
        assert.property(providers, 'PROVIDER_1');
        assert.property(providers, 'PROVIDER_2');

        connection.close();
      });
    });
  });

  describe('CEK Cache TTL', function() {
    it('should use default cache TTL of 2 hours', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;

      const connection = new Connection(config);
      let isDone = false;

      connection.on('end', function() {
        if (!isDone) {
          isDone = true;
          done();
        }
      });

      connection.connect(function(err) {
        if (err) {
          if (!isDone) {
            isDone = true;
            return done(err);
          }
          return;
        }

        assert.strictEqual(
          connection.config.options.columnEncryptionKeyCacheTTL,
          2 * 60 * 60 * 1000
        );

        connection.close();
      });
    });

    it('should allow custom cache TTL', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;
      config.options.columnEncryptionKeyCacheTTL = 3600000;

      const connection = new Connection(config);
      let isDone = false;

      connection.on('end', function() {
        if (!isDone) {
          isDone = true;
          done();
        }
      });

      connection.connect(function(err) {
        if (err) {
          if (!isDone) {
            isDone = true;
            return done(err);
          }
          return;
        }

        assert.strictEqual(
          connection.config.options.columnEncryptionKeyCacheTTL,
          3600000
        );

        connection.close();
      });
    });

    it('should allow zero TTL to disable caching', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;
      config.options.columnEncryptionKeyCacheTTL = 0;

      const connection = new Connection(config);
      let isDone = false;

      connection.on('end', function() {
        if (!isDone) {
          isDone = true;
          done();
        }
      });

      connection.connect(function(err) {
        if (err) {
          if (!isDone) {
            isDone = true;
            return done(err);
          }
          return;
        }

        assert.strictEqual(
          connection.config.options.columnEncryptionKeyCacheTTL,
          0
        );

        connection.close();
      });
    });
  });

  describe('Encrypted Data Flow', function() {
    // These tests require SQL Server 2016+ with Always Encrypted support
    // Skip if not available or if running against older versions
    let connection: Connection;
    let supportsAE = false;
    let setupError: Error | null = null;

    const tableName = 'TestAETable_' + Date.now();
    const cmkName = 'TestCMK_' + Date.now();
    const cekName = 'TestCEK_' + Date.now();

    before(function(done) {
      this.timeout(30000);

      const config = getConfig();
      config.options.alwaysEncrypted = true;
      config.options.encryptionKeyStoreProviders = [new TestKeyStoreProvider()];

      connection = new Connection(config);

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.connect(function(err) {
        if (err) {
          return done(err);
        }

        // Check if server supports column encryption
        supportsAE = connection.serverSupportsColumnEncryption === true;

        if (!supportsAE) {
          return done();
        }

        // Create CMK pointing to our test keystore
        const createCMK = `
          IF NOT EXISTS (SELECT * FROM sys.column_master_keys WHERE name = '${cmkName}')
          BEGIN
            CREATE COLUMN MASTER KEY [${cmkName}]
            WITH (
              KEY_STORE_PROVIDER_NAME = 'TEST_KEYSTORE',
              KEY_PATH = 'test-cmk-path'
            );
          END
        `;

        const request = new Request(createCMK, function(err) {
          if (err) {
            // AE DDL not supported - skip tests
            setupError = err;
            supportsAE = false;
            return done();
          }

          // Create CEK with our encrypted value
          const encryptedHex = ENCRYPTED_CEK_VALUE.toString('hex');
          const createCEK = `
            IF NOT EXISTS (SELECT * FROM sys.column_encryption_keys WHERE name = '${cekName}')
            BEGIN
              CREATE COLUMN ENCRYPTION KEY [${cekName}]
              WITH VALUES (
                COLUMN_MASTER_KEY = [${cmkName}],
                ALGORITHM = 'RSA_OAEP',
                ENCRYPTED_VALUE = 0x${encryptedHex}
              );
            END
          `;

          const request2 = new Request(createCEK, function(err) {
            if (err) {
              // AE DDL not supported - skip tests
              setupError = err;
              supportsAE = false;
              return done();
            }

            // Create table with encrypted column
            const createTable = `
              IF OBJECT_ID('${tableName}', 'U') IS NOT NULL
                DROP TABLE [${tableName}];
              CREATE TABLE [${tableName}] (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                PlainText NVARCHAR(100),
                EncryptedText NVARCHAR(100) COLLATE Latin1_General_BIN2
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  )
              );
            `;

            const request3 = new Request(createTable, function(err) {
              if (err) {
                // AE DDL not supported - skip tests
                setupError = err;
                supportsAE = false;
                return done();
              }
              done();
            });

            connection.execSql(request3);
          });

          connection.execSql(request2);
        });

        connection.execSql(request);
      });
    });

    after(function(done) {
      this.timeout(30000);

      if (!connection) {
        return done();
      }

      // Cleanup: drop table, CEK, and CMK
      const cleanup = `
        IF OBJECT_ID('${tableName}', 'U') IS NOT NULL
          DROP TABLE [${tableName}];
        IF EXISTS (SELECT * FROM sys.column_encryption_keys WHERE name = '${cekName}')
          DROP COLUMN ENCRYPTION KEY [${cekName}];
        IF EXISTS (SELECT * FROM sys.column_master_keys WHERE name = '${cmkName}')
          DROP COLUMN MASTER KEY [${cmkName}];
      `;

      const request = new Request(cleanup, function(err) {
        if (err) {
          console.warn('Cleanup warning:', err.message);
        }
        connection.close();
      });

      connection.on('end', function() {
        done();
      });

      connection.execSql(request);
    });

    it('should create CMK and CEK successfully', function(done) {
      if (!supportsAE) {
        if (setupError) {
          console.log('      Skipping: ' + setupError.message);
        }
        this.skip();
        return;
      }

      // Verify CMK exists
      const checkCMK = `SELECT name FROM sys.column_master_keys WHERE name = '${cmkName}'`;
      let cmkFound = false;

      const request = new Request(checkCMK, function(err) {
        if (err) {
          return done(err);
        }
        assert.isTrue(cmkFound, 'CMK should exist');

        // Verify CEK exists
        const checkCEK = `SELECT name FROM sys.column_encryption_keys WHERE name = '${cekName}'`;
        let cekFound = false;

        const request2 = new Request(checkCEK, function(err) {
          if (err) {
            return done(err);
          }
          assert.isTrue(cekFound, 'CEK should exist');
          done();
        });

        request2.on('row', function(columns) {
          if (columns[0].value === cekName) {
            cekFound = true;
          }
        });

        connection.execSql(request2);
      });

      request.on('row', function(columns) {
        if (columns[0].value === cmkName) {
          cmkFound = true;
        }
      });

      connection.execSql(request);
    });

    it('should read encrypted column metadata correctly', function(done) {
      if (!supportsAE) {
        if (setupError) {
          console.log('      Skipping: ' + setupError.message);
        }
        this.skip();
        return;
      }

      // Query the table to get column metadata
      const query = `SELECT TOP 0 Id, PlainText, EncryptedText FROM [${tableName}]`;

      const request = new Request(query, function(err) {
        done(err);
      });

      request.on('columnMetadata', function(columns) {
        // Verify we have 3 columns
        assert.strictEqual(columns.length, 3);

        // Cast to array for indexing
        const cols = columns as ColumnMetadata[];

        // First column (Id) should not be encrypted
        assert.isUndefined(cols[0].cryptoMetadata);

        // Second column (PlainText) should not be encrypted
        assert.isUndefined(cols[1].cryptoMetadata);

        // Third column (EncryptedText) should be encrypted
        assert.isDefined(cols[2].cryptoMetadata, 'EncryptedText should have cryptoMetadata');
        assert.strictEqual(cols[2].cryptoMetadata!.encryptionType, 1, 'Should be deterministic');

        // Verify baseTypeInfo contains correct length for NVARCHAR(100)
        const baseTypeInfo = cols[2].cryptoMetadata!.baseTypeInfo;
        assert.isDefined(baseTypeInfo, 'baseTypeInfo should be defined');
        assert.strictEqual(baseTypeInfo!.type.name, 'NVarChar', 'Base type should be NVarChar');
        // NVARCHAR(100) = 200 bytes (100 chars * 2 bytes/char)
        assert.strictEqual(baseTypeInfo!.dataLength, 200, 'dataLength should be 200 bytes for NVARCHAR(100)');
      });

      connection.execSql(request);
    });

    it('should query empty encrypted table', function(done) {
      if (!supportsAE) {
        if (setupError) {
          console.log('      Skipping: ' + setupError.message);
        }
        this.skip();
        return;
      }

      const query = `SELECT Id, PlainText, EncryptedText FROM [${tableName}]`;
      let rowCount = 0;

      const request = new Request(query, function(err) {
        if (err) {
          return done(err);
        }
        assert.strictEqual(rowCount, 0, 'Table should be empty');
        done();
      });

      request.on('row', function() {
        rowCount++;
      });

      connection.execSql(request);
    });

    it('should insert data into encrypted column using parameterized query', function(done) {
      if (!supportsAE) {
        if (setupError) {
          console.log('      Skipping: ' + setupError.message);
        }
        this.skip();
        return;
      }

      const plainTextValue = 'Hello World';
      const encryptedTextValue = 'Secret Data 123';

      const insertQuery = `INSERT INTO [${tableName}] (PlainText, EncryptedText) VALUES (@plainText, @encryptedText)`;

      const request = new Request(insertQuery, function(err) {
        if (err) {
          return done(err);
        }
        done();
      });

      request.addParameter('plainText', TYPES.NVarChar, plainTextValue);
      request.addParameter('encryptedText', TYPES.NVarChar, encryptedTextValue);

      connection.execSql(request);
    });

    it('should read decrypted data from encrypted column', function(done) {
      if (!supportsAE) {
        if (setupError) {
          console.log('      Skipping: ' + setupError.message);
        }
        this.skip();
        return;
      }

      const expectedPlainText = 'Hello World';
      const expectedEncryptedText = 'Secret Data 123';

      const query = `SELECT PlainText, EncryptedText FROM [${tableName}] WHERE PlainText = @plainText`;
      let rowCount = 0;
      let receivedPlainText: string | null = null;
      let receivedEncryptedText: string | null = null;

      const request = new Request(query, function(err) {
        if (err) {
          return done(err);
        }
        assert.strictEqual(rowCount, 1, 'Should have exactly one row');
        assert.strictEqual(receivedPlainText, expectedPlainText, 'PlainText should match');
        assert.strictEqual(receivedEncryptedText, expectedEncryptedText, 'EncryptedText should be decrypted and match');
        done();
      });

      request.addParameter('plainText', TYPES.NVarChar, expectedPlainText);

      request.on('row', function(columns) {
        rowCount++;
        receivedPlainText = columns[0].value;
        receivedEncryptedText = columns[1].value;
      });

      connection.execSql(request);
    });

    it('should insert and read multiple rows with encrypted data', function(done) {
      if (!supportsAE) {
        if (setupError) {
          console.log('      Skipping: ' + setupError.message);
        }
        this.skip();
        return;
      }

      const testData = [
        { plain: 'Row 2', encrypted: 'Encrypted Value 2' },
        { plain: 'Row 3', encrypted: 'Encrypted Value 3' },
        { plain: 'Row 4', encrypted: 'Encrypted Value 4' }
      ];

      let insertIndex = 0;

      function insertNext() {
        if (insertIndex >= testData.length) {
          // All inserts done, now verify
          verifyData();
          return;
        }

        const data = testData[insertIndex];
        const insertQuery = `INSERT INTO [${tableName}] (PlainText, EncryptedText) VALUES (@plainText, @encryptedText)`;

        const request = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }
          insertIndex++;
          insertNext();
        });

        request.addParameter('plainText', TYPES.NVarChar, data.plain);
        request.addParameter('encryptedText', TYPES.NVarChar, data.encrypted);

        connection.execSql(request);
      }

      function verifyData() {
        const query = `SELECT PlainText, EncryptedText FROM [${tableName}] ORDER BY Id`;
        const rows: Array<{ plain: string, encrypted: string }> = [];

        const request = new Request(query, function(err) {
          if (err) {
            return done(err);
          }

          // We have 4 rows total (1 from previous test + 3 new)
          assert.strictEqual(rows.length, 4, 'Should have 4 rows');

          // Verify the new rows
          assert.strictEqual(rows[1].plain, 'Row 2');
          assert.strictEqual(rows[1].encrypted, 'Encrypted Value 2');
          assert.strictEqual(rows[2].plain, 'Row 3');
          assert.strictEqual(rows[2].encrypted, 'Encrypted Value 3');
          assert.strictEqual(rows[3].plain, 'Row 4');
          assert.strictEqual(rows[3].encrypted, 'Encrypted Value 4');

          done();
        });

        request.on('row', function(columns) {
          rows.push({
            plain: columns[0].value,
            encrypted: columns[1].value
          });
        });

        connection.execSql(request);
      }

      insertNext();
    });

    it('should handle NULL values in encrypted columns', function(done) {
      if (!supportsAE) {
        if (setupError) {
          console.log('      Skipping: ' + setupError.message);
        }
        this.skip();
        return;
      }

      const plainTextValue = 'Row with NULL encrypted';

      // Insert row with NULL encrypted value
      const insertQuery = `INSERT INTO [${tableName}] (PlainText, EncryptedText) VALUES (@plainText, @encryptedText)`;

      const insertRequest = new Request(insertQuery, function(err) {
        if (err) {
          return done(err);
        }

        // Read it back
        const selectQuery = `SELECT PlainText, EncryptedText FROM [${tableName}] WHERE PlainText = @plainText`;
        let receivedEncryptedText: string | null = null;

        const selectRequest = new Request(selectQuery, function(err) {
          if (err) {
            return done(err);
          }
          assert.isNull(receivedEncryptedText, 'EncryptedText should be NULL');
          done();
        });

        selectRequest.addParameter('plainText', TYPES.NVarChar, plainTextValue);

        selectRequest.on('row', function(columns) {
          receivedEncryptedText = columns[1].value;
        });

        connection.execSql(selectRequest);
      });

      insertRequest.addParameter('plainText', TYPES.NVarChar, plainTextValue);
      // For NULL encrypted values, we need to specify the length to match the column definition
      insertRequest.addParameter('encryptedText', TYPES.NVarChar, null, { length: 100 });

      connection.execSql(insertRequest);
    });

    it('should handle special characters in encrypted data', function(done) {
      if (!supportsAE) {
        if (setupError) {
          console.log('      Skipping: ' + setupError.message);
        }
        this.skip();
        return;
      }

      const plainTextValue = 'Special chars test';
      const encryptedTextValue = '日本語 中文 한국어 émojis: 🔐🔑 & < > " \' \\ / \n \t';

      const insertQuery = `INSERT INTO [${tableName}] (PlainText, EncryptedText) VALUES (@plainText, @encryptedText)`;

      const insertRequest = new Request(insertQuery, function(err) {
        if (err) {
          return done(err);
        }

        // Read it back
        const selectQuery = `SELECT EncryptedText FROM [${tableName}] WHERE PlainText = @plainText`;
        let receivedValue: string | null = null;

        const selectRequest = new Request(selectQuery, function(err) {
          if (err) {
            return done(err);
          }
          assert.strictEqual(receivedValue, encryptedTextValue, 'Special characters should be preserved');
          done();
        });

        selectRequest.addParameter('plainText', TYPES.NVarChar, plainTextValue);

        selectRequest.on('row', function(columns) {
          receivedValue = columns[0].value;
        });

        connection.execSql(selectRequest);
      });

      insertRequest.addParameter('plainText', TYPES.NVarChar, plainTextValue);
      insertRequest.addParameter('encryptedText', TYPES.NVarChar, encryptedTextValue);

      connection.execSql(insertRequest);
    });

    it('should query with encrypted column in WHERE clause (deterministic)', function(done) {
      if (!supportsAE) {
        if (setupError) {
          console.log('      Skipping: ' + setupError.message);
        }
        this.skip();
        return;
      }

      // Since EncryptedText is deterministic, we can use it in WHERE clause
      const searchValue = 'Secret Data 123';

      const query = `SELECT PlainText, EncryptedText FROM [${tableName}] WHERE EncryptedText = @encryptedText`;
      let rowCount = 0;
      let foundPlainText: string | null = null;

      const request = new Request(query, function(err) {
        if (err) {
          return done(err);
        }
        assert.strictEqual(rowCount, 1, 'Should find exactly one row');
        assert.strictEqual(foundPlainText, 'Hello World', 'Should find the correct row');
        done();
      });

      request.addParameter('encryptedText', TYPES.NVarChar, searchValue);

      request.on('row', function(columns) {
        rowCount++;
        foundPlainText = columns[0].value;
      });

      connection.execSql(request);
    });
  });

  describe('Data Type Coverage', function() {
    // Test various SQL Server data types with Always Encrypted
    // These tests require SQL Server 2016+ with Always Encrypted support
    let connection: Connection;
    let supportsAE = false;
    let setupError: Error | null = null;

    const tableName = 'TestAEDataTypes_' + Date.now();
    const cmkName = 'TestCMKDataTypes_' + Date.now();
    const cekName = 'TestCEKDataTypes_' + Date.now();

    before(function(done) {
      this.timeout(60000);

      const config = getConfig();
      config.options.alwaysEncrypted = true;
      config.options.encryptionKeyStoreProviders = [new TestKeyStoreProvider()];

      connection = new Connection(config);

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.connect(function(err) {
        if (err) {
          return done(err);
        }

        supportsAE = connection.serverSupportsColumnEncryption === true;

        if (!supportsAE) {
          return done();
        }

        // Create CMK
        const createCMK = `
          IF NOT EXISTS (SELECT * FROM sys.column_master_keys WHERE name = '${cmkName}')
          BEGIN
            CREATE COLUMN MASTER KEY [${cmkName}]
            WITH (
              KEY_STORE_PROVIDER_NAME = 'TEST_KEYSTORE',
              KEY_PATH = 'test-cmk-path'
            );
          END
        `;

        const request = new Request(createCMK, function(err) {
          if (err) {
            setupError = err;
            supportsAE = false;
            return done();
          }

          // Create CEK
          const encryptedHex = ENCRYPTED_CEK_VALUE.toString('hex');
          const createCEK = `
            IF NOT EXISTS (SELECT * FROM sys.column_encryption_keys WHERE name = '${cekName}')
            BEGIN
              CREATE COLUMN ENCRYPTION KEY [${cekName}]
              WITH VALUES (
                COLUMN_MASTER_KEY = [${cmkName}],
                ALGORITHM = 'RSA_OAEP',
                ENCRYPTED_VALUE = 0x${encryptedHex}
              );
            END
          `;

          const request2 = new Request(createCEK, function(err) {
            if (err) {
              setupError = err;
              supportsAE = false;
              return done();
            }

            // Create table with various encrypted column types
            // Note: Some types require BIN2 collation for deterministic encryption
            const createTable = `
              IF OBJECT_ID('${tableName}', 'U') IS NOT NULL
                DROP TABLE [${tableName}];
              CREATE TABLE [${tableName}] (
                Id INT IDENTITY(1,1) PRIMARY KEY,

                -- Integer types
                EncryptedInt INT
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedBigInt BIGINT
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedSmallInt SMALLINT
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedTinyInt TINYINT
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),

                -- Binary types
                EncryptedBinary BINARY(16)
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedVarBinary VARBINARY(100)
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),

                -- Fixed-length string types (require BIN2 collation)
                EncryptedChar CHAR(20) COLLATE Latin1_General_BIN2
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedNChar NCHAR(20) COLLATE Latin1_General_BIN2
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),

                -- Date/Time types
                EncryptedDate DATE
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedDateTime2 DATETIME2(7)
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedTime TIME(7)
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedDateTimeOffset DATETIMEOFFSET(7)
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),

                -- Decimal types
                EncryptedDecimal DECIMAL(18, 4)
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedNumeric NUMERIC(18, 4)
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedMoney MONEY
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedSmallMoney SMALLMONEY
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),

                -- Floating point types
                EncryptedFloat FLOAT
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedReal REAL
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),

                -- Other types
                EncryptedBit BIT
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedUniqueIdentifier UNIQUEIDENTIFIER
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),

                -- MAX length types (deterministic requires BIN2 collation for string types)
                EncryptedVarCharMax VARCHAR(MAX) COLLATE Latin1_General_BIN2
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedNVarCharMax NVARCHAR(MAX) COLLATE Latin1_General_BIN2
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  ),
                EncryptedVarBinaryMax VARBINARY(MAX)
                  ENCRYPTED WITH (
                    COLUMN_ENCRYPTION_KEY = [${cekName}],
                    ENCRYPTION_TYPE = DETERMINISTIC,
                    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
                  )
              );
            `;

            const request3 = new Request(createTable, function(err) {
              if (err) {
                setupError = err;
                supportsAE = false;
                return done();
              }
              done();
            });

            connection.execSql(request3);
          });

          connection.execSql(request2);
        });

        connection.execSql(request);
      });
    });

    after(function(done) {
      this.timeout(30000);

      if (!connection) {
        return done();
      }

      const cleanup = `
        IF OBJECT_ID('${tableName}', 'U') IS NOT NULL
          DROP TABLE [${tableName}];
        IF EXISTS (SELECT * FROM sys.column_encryption_keys WHERE name = '${cekName}')
          DROP COLUMN ENCRYPTION KEY [${cekName}];
        IF EXISTS (SELECT * FROM sys.column_master_keys WHERE name = '${cmkName}')
          DROP COLUMN MASTER KEY [${cmkName}];
      `;

      const request = new Request(cleanup, function(err) {
        if (err) {
          console.warn('Cleanup warning:', err.message);
        }
        connection.close();
      });

      connection.on('end', function() {
        done();
      });

      connection.execSql(request);
    });

    describe('Integer Types', function() {
      it('should encrypt and decrypt INT values', function(done) {
        if (!supportsAE) {
          if (setupError) {
            console.log('      Skipping: ' + setupError.message);
          }
          this.skip();
          return;
        }

        const testValue = 2147483647; // Max INT value

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedInt) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT EncryptedInt FROM [${tableName}] WHERE EncryptedInt = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.strictEqual(receivedValue, testValue, 'INT value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Int, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Int, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt negative INT values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = -2147483648; // Min INT value

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedInt) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedInt FROM [${tableName}] WHERE EncryptedInt = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.strictEqual(receivedValue, testValue, 'Negative INT value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Int, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Int, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt BIGINT values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = '9223372036854775807'; // Max BIGINT as string (JS precision issues)

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedBigInt) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedBigInt FROM [${tableName}] WHERE EncryptedBigInt = @value`;
          let receivedValue: string | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.strictEqual(receivedValue, testValue, 'BIGINT value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.BigInt, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.BigInt, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt SMALLINT values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = 32767; // Max SMALLINT value

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedSmallInt) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedSmallInt FROM [${tableName}] WHERE EncryptedSmallInt = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.strictEqual(receivedValue, testValue, 'SMALLINT value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.SmallInt, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.SmallInt, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt TINYINT values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = 255; // Max TINYINT value

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedTinyInt) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedTinyInt FROM [${tableName}] WHERE EncryptedTinyInt = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.strictEqual(receivedValue, testValue, 'TINYINT value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.TinyInt, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.TinyInt, testValue);
        connection.execSql(insertRequest);
      });
    });

    describe('Binary Types', function() {
      it('should encrypt and decrypt BINARY values', function(done) {
        if (!supportsAE) {
          if (setupError) {
            console.log('      Skipping: ' + setupError.message);
          }
          this.skip();
          return;
        }

        const testValue = Buffer.from('0123456789abcdef', 'hex'); // 16 bytes

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedBinary) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedBinary FROM [${tableName}] WHERE EncryptedBinary = @value`;
          let receivedValue: Buffer | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.isTrue(testValue.equals(receivedValue!), 'BINARY value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Binary, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Binary, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt VARBINARY values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = Buffer.from('Hello World in Binary!', 'utf8');

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedVarBinary) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedVarBinary FROM [${tableName}] WHERE EncryptedVarBinary = @value`;
          let receivedValue: Buffer | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.isTrue(testValue.equals(receivedValue!), 'VARBINARY value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.VarBinary, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.VarBinary, testValue);
        connection.execSql(insertRequest);
      });
    });

    describe('Fixed-Length String Types', function() {
      it('should encrypt and decrypt CHAR values', function(done) {
        if (!supportsAE) {
          if (setupError) {
            console.log('      Skipping: ' + setupError.message);
          }
          this.skip();
          return;
        }

        const testValue = 'TestCharValue'; // Will be padded to 20 chars

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedChar) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          // For CHAR, SQL Server pads with spaces - need to search with padded value
          const selectQuery = `SELECT TOP 1 EncryptedChar FROM [${tableName}] WHERE EncryptedChar = @value`;
          let receivedValue: string | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            // CHAR values are padded with spaces
            assert.strictEqual(receivedValue!.trim(), testValue, 'CHAR value should match (after trim)');
            done();
          });

          // Pass the value with proper length for CHAR(20)
          selectRequest.addParameter('value', TYPES.Char, testValue, { length: 20 });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Char, testValue, { length: 20 });
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt NCHAR values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = 'Unicode: 日本語'; // Unicode test with fixed length

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedNChar) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedNChar FROM [${tableName}] WHERE EncryptedNChar = @value`;
          let receivedValue: string | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            // NCHAR values are padded with spaces
            assert.strictEqual(receivedValue!.trim(), testValue, 'NCHAR value should match (after trim)');
            done();
          });

          selectRequest.addParameter('value', TYPES.NChar, testValue, { length: 20 });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.NChar, testValue, { length: 20 });
        connection.execSql(insertRequest);
      });
    });

    describe('Date/Time Types', function() {
      it('should encrypt and decrypt DATE values', function(done) {
        if (!supportsAE) {
          if (setupError) {
            console.log('      Skipping: ' + setupError.message);
          }
          this.skip();
          return;
        }

        const testValue = new Date('2024-06-15');

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedDate) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedDate FROM [${tableName}] WHERE EncryptedDate = @value`;
          let receivedValue: Date | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            // Compare date parts only (DATE type doesn't have time)
            assert.strictEqual(
              receivedValue!.toISOString().split('T')[0],
              testValue.toISOString().split('T')[0],
              'DATE value should match'
            );
            done();
          });

          selectRequest.addParameter('value', TYPES.Date, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Date, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt DATETIME2 values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = new Date('2024-06-15T14:30:45.1234567Z');

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedDateTime2) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedDateTime2 FROM [${tableName}] WHERE EncryptedDateTime2 = @value`;
          let receivedValue: Date | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            // Compare with some tolerance for precision
            const diff = Math.abs(receivedValue!.getTime() - testValue.getTime());
            assert.isBelow(diff, 10, 'DATETIME2 value should be within 10ms');
            done();
          });

          selectRequest.addParameter('value', TYPES.DateTime2, testValue, { scale: 7 });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.DateTime2, testValue, { scale: 7 });
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt TIME values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        // TIME is represented as a Date in JavaScript, only time portion matters
        const testValue = new Date('1970-01-01T14:30:45.1230000Z');

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedTime) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedTime FROM [${tableName}] WHERE EncryptedTime = @value`;
          let receivedValue: Date | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            // Compare time portions
            assert.strictEqual(receivedValue!.getUTCHours(), testValue.getUTCHours(), 'Hours should match');
            assert.strictEqual(receivedValue!.getUTCMinutes(), testValue.getUTCMinutes(), 'Minutes should match');
            assert.strictEqual(receivedValue!.getUTCSeconds(), testValue.getUTCSeconds(), 'Seconds should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Time, testValue, { scale: 7 });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Time, testValue, { scale: 7 });
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt DATETIMEOFFSET values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = new Date('2024-06-15T14:30:45.123+05:30');

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedDateTimeOffset) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedDateTimeOffset FROM [${tableName}] WHERE EncryptedDateTimeOffset = @value`;
          let receivedValue: Date | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            // Compare with tolerance
            const diff = Math.abs(receivedValue!.getTime() - testValue.getTime());
            assert.isBelow(diff, 10, 'DATETIMEOFFSET value should be within 10ms');
            done();
          });

          selectRequest.addParameter('value', TYPES.DateTimeOffset, testValue, { scale: 7 });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.DateTimeOffset, testValue, { scale: 7 });
        connection.execSql(insertRequest);
      });
    });

    describe('Decimal Types', function() {
      it('should encrypt and decrypt DECIMAL values', function(done) {
        if (!supportsAE) {
          if (setupError) {
            console.log('      Skipping: ' + setupError.message);
          }
          this.skip();
          return;
        }

        const testValue = 12345678901234.5678;

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedDecimal) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedDecimal FROM [${tableName}] WHERE EncryptedDecimal = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.closeTo(receivedValue!, testValue, 0.0001, 'DECIMAL value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Decimal, testValue, { precision: 18, scale: 4 });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Decimal, testValue, { precision: 18, scale: 4 });
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt NUMERIC values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = -9876543210.1234;

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedNumeric) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedNumeric FROM [${tableName}] WHERE EncryptedNumeric = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.closeTo(receivedValue!, testValue, 0.0001, 'NUMERIC value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Numeric, testValue, { precision: 18, scale: 4 });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Numeric, testValue, { precision: 18, scale: 4 });
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt MONEY values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = 123456789.1234; // Test MONEY value

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedMoney) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedMoney FROM [${tableName}] WHERE EncryptedMoney = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.closeTo(receivedValue!, testValue, 0.01, 'MONEY value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Money, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Money, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt SMALLMONEY values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = 214748.3647; // Near max SMALLMONEY value

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedSmallMoney) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedSmallMoney FROM [${tableName}] WHERE EncryptedSmallMoney = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.closeTo(receivedValue!, testValue, 0.01, 'SMALLMONEY value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.SmallMoney, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.SmallMoney, testValue);
        connection.execSql(insertRequest);
      });
    });

    describe('Floating Point Types', function() {
      it('should encrypt and decrypt FLOAT values', function(done) {
        if (!supportsAE) {
          if (setupError) {
            console.log('      Skipping: ' + setupError.message);
          }
          this.skip();
          return;
        }

        const testValue = 3.141592653589793;

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedFloat) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedFloat FROM [${tableName}] WHERE EncryptedFloat = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.closeTo(receivedValue!, testValue, 1e-10, 'FLOAT value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Float, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Float, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt REAL values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = 2.718281828;

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedReal) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedReal FROM [${tableName}] WHERE EncryptedReal = @value`;
          let receivedValue: number | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            // REAL has less precision than FLOAT
            assert.closeTo(receivedValue!, testValue, 1e-5, 'REAL value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Real, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Real, testValue);
        connection.execSql(insertRequest);
      });
    });

    describe('Other Types', function() {
      it('should encrypt and decrypt BIT values (true)', function(done) {
        if (!supportsAE) {
          if (setupError) {
            console.log('      Skipping: ' + setupError.message);
          }
          this.skip();
          return;
        }

        const testValue = true;

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedBit) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedBit FROM [${tableName}] WHERE EncryptedBit = @value`;
          let receivedValue: boolean | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.strictEqual(receivedValue, testValue, 'BIT true value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Bit, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Bit, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt BIT values (false)', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = false;

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedBit) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedBit FROM [${tableName}] WHERE EncryptedBit = @value`;
          let receivedValue: boolean | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.strictEqual(receivedValue, testValue, 'BIT false value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.Bit, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.Bit, testValue);
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt UNIQUEIDENTIFIER values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = 'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11';

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedUniqueIdentifier) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          const selectQuery = `SELECT TOP 1 EncryptedUniqueIdentifier FROM [${tableName}] WHERE EncryptedUniqueIdentifier = @value`;
          let receivedValue: string | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.strictEqual(
              receivedValue!.toUpperCase(),
              testValue.toUpperCase(),
              'UNIQUEIDENTIFIER value should match'
            );
            done();
          });

          selectRequest.addParameter('value', TYPES.UniqueIdentifier, testValue);
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.UniqueIdentifier, testValue);
        connection.execSql(insertRequest);
      });
    });

    describe('MAX Length Types', function() {
      it('should encrypt and decrypt VARCHAR(MAX) values', function(done) {
        if (!supportsAE) {
          if (setupError) {
            console.log('      Skipping: ' + setupError.message);
          }
          this.skip();
          return;
        }

        // Create a large string (10KB)
        const testValue = 'A'.repeat(10000) + ' - End of VARCHAR(MAX) test';

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedVarCharMax) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          // With deterministic encryption, we can use WHERE clause
          const selectQuery = `SELECT EncryptedVarCharMax FROM [${tableName}] WHERE EncryptedVarCharMax = @value`;
          let receivedValue: string | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.strictEqual(receivedValue, testValue, 'VARCHAR(MAX) value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.VarChar, testValue, { length: Infinity });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.VarChar, testValue, { length: Infinity });
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt NVARCHAR(MAX) values with Unicode', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        // Create a large Unicode string with various characters
        const testValue = '日本語テスト '.repeat(1000) + '🔐🔑 End of NVARCHAR(MAX) test with émojis and spëcial çhàracters';

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedNVarCharMax) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          // With deterministic encryption, we can use WHERE clause
          const selectQuery = `SELECT EncryptedNVarCharMax FROM [${tableName}] WHERE EncryptedNVarCharMax = @value`;
          let receivedValue: string | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.strictEqual(receivedValue, testValue, 'NVARCHAR(MAX) value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.NVarChar, testValue, { length: Infinity });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.NVarChar, testValue, { length: Infinity });
        connection.execSql(insertRequest);
      });

      it('should encrypt and decrypt VARBINARY(MAX) values', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        // Create a large binary buffer (10KB of random data)
        const testValue = crypto.randomBytes(10000);

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedVarBinaryMax) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          // With deterministic encryption, we can use WHERE clause
          const selectQuery = `SELECT EncryptedVarBinaryMax FROM [${tableName}] WHERE EncryptedVarBinaryMax = @value`;
          let receivedValue: Buffer | null = null;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isNotNull(receivedValue, 'Should receive a value');
            assert.isTrue(testValue.equals(receivedValue!), 'VARBINARY(MAX) value should match');
            done();
          });

          selectRequest.addParameter('value', TYPES.VarBinary, testValue, { length: Infinity });
          selectRequest.on('row', function(columns) {
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.VarBinary, testValue, { length: Infinity });
        connection.execSql(insertRequest);
      });

      it('should handle empty strings in VARCHAR(MAX)', function(done) {
        if (!supportsAE) {
          this.skip();
          return;
        }

        const testValue = '';

        const insertQuery = `INSERT INTO [${tableName}] (EncryptedVarCharMax) VALUES (@value)`;
        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          // With deterministic encryption, we can use WHERE clause for empty string
          const selectQuery = `SELECT EncryptedVarCharMax FROM [${tableName}] WHERE EncryptedVarCharMax = @value`;
          let receivedValue: string | null = null;
          let rowReceived = false;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isTrue(rowReceived, 'Should receive a row');
            assert.strictEqual(receivedValue, testValue, 'Empty string should be preserved');
            done();
          });

          selectRequest.addParameter('value', TYPES.VarChar, testValue, { length: Infinity });
          selectRequest.on('row', function(columns) {
            rowReceived = true;
            receivedValue = columns[0].value;
          });

          connection.execSql(selectRequest);
        });

        insertRequest.addParameter('value', TYPES.VarChar, testValue, { length: Infinity });
        connection.execSql(insertRequest);
      });
    });

    describe('NULL Values for All Types', function() {
      it('should handle NULL values for all encrypted data types', function(done) {
        if (!supportsAE) {
          if (setupError) {
            console.log('      Skipping: ' + setupError.message);
          }
          this.skip();
          return;
        }

        // Insert a row with all NULL encrypted columns
        const insertQuery = `
          INSERT INTO [${tableName}] (
            EncryptedInt, EncryptedBigInt, EncryptedSmallInt, EncryptedTinyInt,
            EncryptedBinary, EncryptedVarBinary,
            EncryptedChar, EncryptedNChar,
            EncryptedDate, EncryptedDateTime2, EncryptedTime, EncryptedDateTimeOffset,
            EncryptedDecimal, EncryptedNumeric, EncryptedMoney, EncryptedSmallMoney,
            EncryptedFloat, EncryptedReal,
            EncryptedBit, EncryptedUniqueIdentifier,
            EncryptedVarCharMax, EncryptedNVarCharMax, EncryptedVarBinaryMax
          ) VALUES (
            @int, @bigint, @smallint, @tinyint,
            @binary, @varbinary,
            @char, @nchar,
            @date, @datetime2, @time, @datetimeoffset,
            @decimal, @numeric, @money, @smallmoney,
            @float, @real,
            @bit, @uniqueidentifier,
            @varcharmax, @nvarcharmax, @varbinarymax
          )
        `;

        const insertRequest = new Request(insertQuery, function(err) {
          if (err) {
            return done(err);
          }

          // Select the row and verify all values are NULL
          // Use a very specific WHERE clause to ensure we get our inserted row (not rows from previous tests)
          // Check ALL columns to avoid picking up rows from other tests
          const selectQuery = `
            SELECT TOP 1
              EncryptedInt, EncryptedBigInt, EncryptedSmallInt, EncryptedTinyInt,
              EncryptedBinary, EncryptedVarBinary,
              EncryptedChar, EncryptedNChar,
              EncryptedDate, EncryptedDateTime2, EncryptedTime, EncryptedDateTimeOffset,
              EncryptedDecimal, EncryptedNumeric, EncryptedMoney, EncryptedSmallMoney,
              EncryptedFloat, EncryptedReal,
              EncryptedBit, EncryptedUniqueIdentifier,
              EncryptedVarCharMax, EncryptedNVarCharMax, EncryptedVarBinaryMax
            FROM [${tableName}]
            WHERE EncryptedInt IS NULL
              AND EncryptedBigInt IS NULL
              AND EncryptedSmallInt IS NULL
              AND EncryptedTinyInt IS NULL
              AND EncryptedBinary IS NULL
              AND EncryptedVarBinary IS NULL
              AND EncryptedChar IS NULL
              AND EncryptedNChar IS NULL
              AND EncryptedDate IS NULL
              AND EncryptedDateTime2 IS NULL
              AND EncryptedTime IS NULL
              AND EncryptedDateTimeOffset IS NULL
              AND EncryptedDecimal IS NULL
              AND EncryptedNumeric IS NULL
              AND EncryptedMoney IS NULL
              AND EncryptedSmallMoney IS NULL
              AND EncryptedFloat IS NULL
              AND EncryptedReal IS NULL
              AND EncryptedBit IS NULL
              AND EncryptedUniqueIdentifier IS NULL
              AND EncryptedVarCharMax IS NULL
              AND EncryptedNVarCharMax IS NULL
              AND EncryptedVarBinaryMax IS NULL
          `;

          let rowReceived = false;

          const selectRequest = new Request(selectQuery, function(err) {
            if (err) {
              return done(err);
            }
            assert.isTrue(rowReceived, 'Should receive a row');
            done();
          });

          selectRequest.on('row', function(columns) {
            rowReceived = true;
            // Verify all columns are NULL
            for (let i = 0; i < columns.length; i++) {
              assert.isNull(columns[i].value, `Column ${i} should be NULL`);
            }
          });

          connection.execSql(selectRequest);
        });

        // Add all parameters as NULL with appropriate types
        insertRequest.addParameter('int', TYPES.Int, null);
        insertRequest.addParameter('bigint', TYPES.BigInt, null);
        insertRequest.addParameter('smallint', TYPES.SmallInt, null);
        insertRequest.addParameter('tinyint', TYPES.TinyInt, null);
        insertRequest.addParameter('binary', TYPES.Binary, null, { length: 16 });
        insertRequest.addParameter('varbinary', TYPES.VarBinary, null, { length: 100 });
        insertRequest.addParameter('char', TYPES.Char, null, { length: 20 });
        insertRequest.addParameter('nchar', TYPES.NChar, null, { length: 20 });
        insertRequest.addParameter('date', TYPES.Date, null);
        insertRequest.addParameter('datetime2', TYPES.DateTime2, null, { scale: 7 });
        insertRequest.addParameter('time', TYPES.Time, null, { scale: 7 });
        insertRequest.addParameter('datetimeoffset', TYPES.DateTimeOffset, null, { scale: 7 });
        insertRequest.addParameter('decimal', TYPES.Decimal, null, { precision: 18, scale: 4 });
        insertRequest.addParameter('numeric', TYPES.Numeric, null, { precision: 18, scale: 4 });
        insertRequest.addParameter('money', TYPES.Money, null);
        insertRequest.addParameter('smallmoney', TYPES.SmallMoney, null);
        insertRequest.addParameter('float', TYPES.Float, null);
        insertRequest.addParameter('real', TYPES.Real, null);
        insertRequest.addParameter('bit', TYPES.Bit, null);
        insertRequest.addParameter('uniqueidentifier', TYPES.UniqueIdentifier, null);
        insertRequest.addParameter('varcharmax', TYPES.VarChar, null, { length: Infinity });
        insertRequest.addParameter('nvarcharmax', TYPES.NVarChar, null, { length: Infinity });
        insertRequest.addParameter('varbinarymax', TYPES.VarBinary, null, { length: Infinity });

        connection.execSql(insertRequest);
      });
    });
  });

  describe('Test Keystore Provider', function() {
    it('should encrypt and decrypt CEK correctly', function() {
      // Generate a test CEK
      const originalCek = crypto.randomBytes(32);

      // Encrypt it
      const encrypted = encryptCekForTest(originalCek);

      // Decrypt it
      const decrypted = decryptCekForTest(encrypted);

      // Verify they match
      assert.isTrue(originalCek.equals(decrypted), 'Decrypted CEK should match original');
    });

    it('should decrypt the pre-encrypted CEK value', function() {
      const decrypted = decryptCekForTest(ENCRYPTED_CEK_VALUE);
      assert.isTrue(TEST_CEK.equals(decrypted), 'Should decrypt to the test CEK');
    });

    it('should provide correct provider interface', async function() {
      const provider = new TestKeyStoreProvider();

      assert.strictEqual(provider.name, 'TEST_KEYSTORE');
      assert.isFunction(provider.decryptColumnEncryptionKey);

      // Test decryption
      const decrypted = await provider.decryptColumnEncryptionKey(
        'test-cmk-path',
        'RSA_OAEP',
        ENCRYPTED_CEK_VALUE
      );

      assert.isTrue(TEST_CEK.equals(decrypted), 'Provider should decrypt correctly');
    });

    it('should reject unknown master key path', async function() {
      const provider = new TestKeyStoreProvider();

      try {
        await provider.decryptColumnEncryptionKey(
          'unknown-path',
          'RSA_OAEP',
          ENCRYPTED_CEK_VALUE
        );
        assert.fail('Should have thrown an error');
      } catch (err: any) {
        assert.include(err.message, 'Unknown master key path');
      }
    });
  });
});
