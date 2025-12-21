import { assert } from 'chai';
import * as crypto from 'crypto';

import Connection from '../../src/connection';
import Request from '../../src/request';
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
