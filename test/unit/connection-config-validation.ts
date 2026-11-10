import { Connection } from '../../src/tedious';
import { assert } from 'chai';

function ensureConnectionIsClosed(connection: Connection, callback: () => void) {
  if (connection.closed) {
    process.nextTick(callback);
    return;
  }

  connection.on('end', callback);
  connection.close();
}

describe('Connection configuration validation', function() {
  let config: any;

  beforeEach(function() {
    config = {};
    config.options = { encrypt: false };
    config.server = 'localhost';
  });

  it('default transient retry interval', function() {
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.connectionRetryInterval, 500);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good transient retry interval', function() {
    const goodRetryInterval = 75;
    config.options.connectionRetryInterval = goodRetryInterval;
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.connectionRetryInterval, goodRetryInterval);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('bad transient retry interval', function() {
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

  it('default max transient retries', function() {
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.maxRetriesOnTransientErrors, 3);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good max transient retries', function() {
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

  it('bad max transient retries', function() {
    const negativeMaxRetries = -5;
    config.options.maxRetriesOnTransientErrors = negativeMaxRetries;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad azure ad authentication method', function() {
    const authenticationMethod = 'abc';
    config.authentication = authenticationMethod;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad tds version for with azure ad', function() {
    const authenticationMethod = 'activedirectorypassword';
    config.authentication = authenticationMethod;
    config.options.tdsVersion = '7_2';
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad encrypt value type', function() {
    const numberEncrypt = 0;
    config.options.encrypt = numberEncrypt;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad encrypt string', function() {
    config.options.encrypt = 'false';
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('good false encrypt value', function() {
    config.options.encrypt = false;
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.encrypt, false);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good true encrypt value', function() {
    config.options.encrypt = true;
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.encrypt, true);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good strict encrypt value', function() {
    config.options.encrypt = 'strict';
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.encrypt, 'strict');
    ensureConnectionIsClosed(connection, () => {});
  });

  describe('columnEncryption', function() {
    const provider = { decryptColumnEncryptionKey: () => Buffer.alloc(32) };

    it('is not set by default', function() {
      const connection = new Connection(config);
      assert.isUndefined(connection.config.options.columnEncryption);
      assert.isFalse(connection.config.options.serverSupportsColumnEncryption);
      ensureConnectionIsClosed(connection, () => {});
    });

    it('accepts key store providers, and applies defaults', function() {
      config.options.columnEncryption = { keyStoreProviders: { AZURE_KEY_VAULT: provider } };

      const connection = new Connection(config);
      const { columnEncryption } = connection.config.options;

      assert.strictEqual(columnEncryption!.keyStoreProviders.get('AZURE_KEY_VAULT'), provider);
      assert.strictEqual(columnEncryption!.keyCacheTTL, 2 * 60 * 60 * 1000);
      assert.isUndefined(columnEncryption!.trustedKeyPaths);
      assert.strictEqual(columnEncryption!.parameterMetadataCacheSize, 1000);

      // Whether the server supports it is only known once it was negotiated.
      assert.isFalse(connection.config.options.serverSupportsColumnEncryption);
      ensureConnectionIsClosed(connection, () => {});
    });

    it('rejects invalid options', function() {
      config.options.columnEncryption = true;
      assert.throws(() => {
        new Connection(config);
      }, TypeError, 'The "config.options.columnEncryption" property must be of type object.');

      config.options.columnEncryption = {};
      assert.throws(() => {
        new Connection(config);
      }, TypeError, 'The "config.options.columnEncryption.keyStoreProviders" property must be of type object.');

      config.options.columnEncryption = { keyStoreProviders: { AZURE_KEY_VAULT: {} } };
      assert.throws(() => {
        new Connection(config);
      }, TypeError, 'The "config.options.columnEncryption.keyStoreProviders.AZURE_KEY_VAULT" property must be a key store provider: an object with a "decryptColumnEncryptionKey" method.');
    });

    it('requires TDS 7.4', function() {
      config.options.columnEncryption = { keyStoreProviders: { AZURE_KEY_VAULT: provider } };

      for (const tdsVersion of ['7_1', '7_2', '7_3_A', '7_3_B']) {
        config.options.tdsVersion = tdsVersion;

        assert.throws(() => {
          new Connection(config);
        }, TypeError, 'The "config.options.columnEncryption" property requires "config.options.tdsVersion" to be "7_4".');
      }

      config.options.tdsVersion = '7_4';
      ensureConnectionIsClosed(new Connection(config), () => {});
    });
  });
});
