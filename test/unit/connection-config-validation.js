const Connection = require('../../src/tedious').Connection;
const assert = require('chai').assert;

function ensureConnectionIsClosed(connection, callback) {
  if (connection.closed) {
    process.nextTick(callback);
    return;
  }

  connection.on('end', callback);
  connection.close();
}

describe('Connection configuration validation', function() {
  let config;

  beforeEach(function() {
    config = {};
    config.options = { encrypt: false };
    config.server = 'localhost';
  });

  it('default transient retry interval', () => {
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.connectionRetryInterval, 500);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good transient retry interval', () => {
    const goodRetryInterval = 75;
    config.options.connectionRetryInterval = goodRetryInterval;
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.connectionRetryInterval, goodRetryInterval);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('bad transient retry interval', () => {
    const zeroRetryInterval = 0;
    config.options.connectionRetryInterval = zeroRetryInterval;
    assert.throws(() => {
      new Connection(config);
    });

    const negativeRetryInterval = -25;
    config.options.connectionRetryInterval = negativeRetryInterval;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('default max transient retries', () => {
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.maxRetriesOnTransientErrors, 3);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good max transient retries', () => {
    const zeroMaxRetries = 0;
    config.options.maxRetriesOnTransientErrors = zeroMaxRetries;
    const firstConnection = new Connection(config);
    assert.strictEqual(firstConnection.config.options.maxRetriesOnTransientErrors, zeroMaxRetries);

    const nonZeroMaxRetries = 5;
    config.options.maxRetriesOnTransientErrors = nonZeroMaxRetries;
    const secondConnection = new Connection(config);
    assert.strictEqual(secondConnection.config.options.maxRetriesOnTransientErrors, nonZeroMaxRetries);

    ensureConnectionIsClosed(firstConnection, () => {
      ensureConnectionIsClosed(secondConnection, () => {});
    });
  });

  it('bad max transient retries', () => {
    const negativeMaxRetries = -5;
    config.options.maxRetriesOnTransientErrors = negativeMaxRetries;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad azure ad authentication method', () => {
    const authenticationMethod = 'abc';
    config.authentication = authenticationMethod;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad tds version for with azure ad', () => {
    const authenticationMethod = 'activedirectorypassword';
    config.authentication = authenticationMethod;
    config.options.tdsVersion = '7_2';
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad encrypt value type', () => {
    const numberEncrypt = 0;
    config.options.encrypt = numberEncrypt;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad encrypt string', () => {
    config.options.encrypt = 'false';
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('good false encrypt value', () => {
    config.options.encrypt = false;
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.encrypt, false);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good true encrypt value', () => {
    config.options.encrypt = true;
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.encrypt, true);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good strict encrypt value', () => {
    config.options.encrypt = 'strict';
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.encrypt, 'strict');
    ensureConnectionIsClosed(connection, () => {});
  });

  // Always Encrypted configuration tests
  describe('Always Encrypted options', function() {
    it('default alwaysEncrypted value is false', () => {
      const connection = new Connection(config);
      assert.strictEqual(connection.config.options.alwaysEncrypted, false);
      ensureConnectionIsClosed(connection, () => {});
    });

    it('good alwaysEncrypted value (true)', () => {
      config.options.alwaysEncrypted = true;
      const connection = new Connection(config);
      assert.strictEqual(connection.config.options.alwaysEncrypted, true);
      ensureConnectionIsClosed(connection, () => {});
    });

    it('good alwaysEncrypted value (false)', () => {
      config.options.alwaysEncrypted = false;
      const connection = new Connection(config);
      assert.strictEqual(connection.config.options.alwaysEncrypted, false);
      ensureConnectionIsClosed(connection, () => {});
    });

    it('bad alwaysEncrypted value (non-boolean)', () => {
      config.options.alwaysEncrypted = 'true';
      assert.throws(() => {
        new Connection(config);
      }, TypeError);
    });

    it('default columnEncryptionKeyCacheTTL value', () => {
      const connection = new Connection(config);
      assert.strictEqual(connection.config.options.columnEncryptionKeyCacheTTL, 2 * 60 * 60 * 1000);
      ensureConnectionIsClosed(connection, () => {});
    });

    it('good columnEncryptionKeyCacheTTL value', () => {
      config.options.columnEncryptionKeyCacheTTL = 3600000;
      const connection = new Connection(config);
      assert.strictEqual(connection.config.options.columnEncryptionKeyCacheTTL, 3600000);
      ensureConnectionIsClosed(connection, () => {});
    });

    it('good columnEncryptionKeyCacheTTL value (zero disables caching)', () => {
      config.options.columnEncryptionKeyCacheTTL = 0;
      const connection = new Connection(config);
      assert.strictEqual(connection.config.options.columnEncryptionKeyCacheTTL, 0);
      ensureConnectionIsClosed(connection, () => {});
    });

    it('bad columnEncryptionKeyCacheTTL value (non-number)', () => {
      config.options.columnEncryptionKeyCacheTTL = '3600000';
      assert.throws(() => {
        new Connection(config);
      }, TypeError);
    });

    it('bad columnEncryptionKeyCacheTTL value (negative)', () => {
      config.options.columnEncryptionKeyCacheTTL = -1000;
      assert.throws(() => {
        new Connection(config);
      }, RangeError);
    });

    it('good encryptionKeyStoreProviders (valid provider array)', () => {
      const mockProvider = {
        name: 'MOCK_PROVIDER',
        decryptColumnEncryptionKey: async () => Buffer.alloc(32)
      };
      config.options.encryptionKeyStoreProviders = [mockProvider];
      const connection = new Connection(config);
      assert.deepEqual(
        Object.keys(connection.config.options.encryptionKeyStoreProviders),
        ['MOCK_PROVIDER']
      );
      assert.strictEqual(
        connection.config.options.encryptionKeyStoreProviders.MOCK_PROVIDER,
        mockProvider
      );
      ensureConnectionIsClosed(connection, () => {});
    });

    it('good encryptionKeyStoreProviders (multiple providers)', () => {
      const provider1 = {
        name: 'PROVIDER_1',
        decryptColumnEncryptionKey: async () => Buffer.alloc(32)
      };
      const provider2 = {
        name: 'PROVIDER_2',
        decryptColumnEncryptionKey: async () => Buffer.alloc(32)
      };
      config.options.encryptionKeyStoreProviders = [provider1, provider2];
      const connection = new Connection(config);
      assert.deepEqual(
        Object.keys(connection.config.options.encryptionKeyStoreProviders).sort(),
        ['PROVIDER_1', 'PROVIDER_2']
      );
      ensureConnectionIsClosed(connection, () => {});
    });

    it('bad encryptionKeyStoreProviders (not an array)', () => {
      config.options.encryptionKeyStoreProviders = {
        name: 'MOCK_PROVIDER',
        decryptColumnEncryptionKey: async () => Buffer.alloc(32)
      };
      assert.throws(() => {
        new Connection(config);
      }, TypeError);
    });

    it('bad encryptionKeyStoreProviders (provider missing name)', () => {
      config.options.encryptionKeyStoreProviders = [{
        decryptColumnEncryptionKey: async () => Buffer.alloc(32)
      }];
      assert.throws(() => {
        new Connection(config);
      }, TypeError);
    });

    it('bad encryptionKeyStoreProviders (provider missing decryptColumnEncryptionKey)', () => {
      config.options.encryptionKeyStoreProviders = [{
        name: 'MOCK_PROVIDER'
      }];
      assert.throws(() => {
        new Connection(config);
      }, TypeError);
    });
  });
});
