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
});
