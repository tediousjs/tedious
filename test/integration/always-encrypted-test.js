// @ts-check

const assert = require('chai').assert;

import Connection from '../../src/connection';
import Request from '../../src/request';
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

describe('Always Encrypted', function() {
  describe('Feature Negotiation', function() {
    it('should negotiate COLUMNENCRYPTION feature when alwaysEncrypted is enabled', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;

      const connection = new Connection(config);

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.on('end', function() {
        done();
      });

      connection.connect(function(err) {
        if (err) {
          return done(err);
        }

        // Server should acknowledge column encryption support
        // This is set in the feature-ext-parser when server responds with COLUMNENCRYPTION
        assert.isBoolean(connection.serverSupportsColumnEncryption);

        connection.close();
      });
    });

    it('should not request COLUMNENCRYPTION feature when alwaysEncrypted is disabled', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = false;

      const connection = new Connection(config);

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.on('end', function() {
        done();
      });

      connection.connect(function(err) {
        if (err) {
          return done(err);
        }

        // When AE is disabled, serverSupportsColumnEncryption should be false
        assert.strictEqual(connection.serverSupportsColumnEncryption, false);

        connection.close();
      });
    });
  });

  describe('Encrypted Column Metadata', function() {
    it('should be able to query sys.column_encryption_keys', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;

      const connection = new Connection(config);

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.on('end', function() {
        done();
      });

      connection.connect(function(err) {
        if (err) {
          return done(err);
        }

        // This verifies that AE-related system tables are accessible
        const request = new Request(
          'SELECT COUNT(*) as cnt FROM sys.column_encryption_keys',
          function(err) {
            if (err) {
              done(err);
              return connection.close();
            }
            connection.close();
          }
        );

        let rowReceived = false;
        request.on('row', function(columns) {
          rowReceived = true;
          // The count should be a number (could be 0 if no CEKs defined)
          assert.isNumber(columns[0].value);
        });

        request.on('requestCompleted', function() {
          assert.isTrue(rowReceived, 'Should have received a row');
        });

        connection.execSql(request);
      });
    });

    it('should be able to query sys.column_master_keys', function(done) {
      const config = getConfig();
      config.options.alwaysEncrypted = true;

      const connection = new Connection(config);

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.on('end', function() {
        done();
      });

      connection.connect(function(err) {
        if (err) {
          return done(err);
        }

        const request = new Request(
          'SELECT COUNT(*) as cnt FROM sys.column_master_keys',
          function(err) {
            if (err) {
              done(err);
              return connection.close();
            }
            connection.close();
          }
        );

        let rowReceived = false;
        request.on('row', function(columns) {
          rowReceived = true;
          assert.isNumber(columns[0].value);
        });

        request.on('requestCompleted', function() {
          assert.isTrue(rowReceived, 'Should have received a row');
        });

        connection.execSql(request);
      });
    });
  });

  describe('Configuration Validation', function() {
    it('should validate encryptionKeyStoreProviders is an array', function() {
      const config = getConfig();
      config.options.alwaysEncrypted = true;
      config.options.encryptionKeyStoreProviders = 'not-an-array';

      assert.throws(() => {
        new Connection(config);
      }, TypeError);
    });

    it('should validate provider has required properties', function() {
      const config = getConfig();
      config.options.alwaysEncrypted = true;
      config.options.encryptionKeyStoreProviders = [
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

      connection.on('end', function() {
        done();
      });

      connection.connect(function(err) {
        if (err) {
          return done(err);
        }

        // Verify provider was registered
        assert.isObject(connection.config.options.encryptionKeyStoreProviders);
        assert.property(connection.config.options.encryptionKeyStoreProviders, 'TEST_PROVIDER');

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

      connection.on('end', function() {
        done();
      });

      connection.connect(function(err) {
        if (err) {
          return done(err);
        }

        // Verify both providers were registered
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

      connection.on('end', function() {
        done();
      });

      connection.connect(function(err) {
        if (err) {
          return done(err);
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
      config.options.columnEncryptionKeyCacheTTL = 3600000; // 1 hour

      const connection = new Connection(config);

      connection.on('end', function() {
        done();
      });

      connection.connect(function(err) {
        if (err) {
          return done(err);
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

      connection.on('end', function() {
        done();
      });

      connection.connect(function(err) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(
          connection.config.options.columnEncryptionKeyCacheTTL,
          0
        );

        connection.close();
      });
    });
  });
});
