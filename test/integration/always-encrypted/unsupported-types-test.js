const Connection = require('../../../src/connection');
const Request = require('../../../src/request');

const fs = require('fs');
const { assert } = require('chai');

const config = JSON.parse(
  fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
).config;

config.options.debug = {
  packet: true,
  data: true,
  payload: true,
  token: true,
  log: true
};
config.options.columnEncryptionSetting = true;
const alwaysEncryptedCEK = Buffer.from([
  // decrypted column key must be 32 bytes long for AES256
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
config.options.encryptionKeyStoreProviders = [{
  key: 'TEST_KEYSTORE',
  value: {
    decryptColumnEncryptionKey: () => Promise.resolve(alwaysEncryptedCEK),
  },
}];
config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

describe('always encrypted', function() {
  let connection;

  before(function() {
    if (config.options.tdsVersion < '7_4') {
      this.skip();
    }
  });

  const createKeys = (cb) => {
    const request = new Request(`CREATE COLUMN MASTER KEY [CMK1] WITH (
      KEY_STORE_PROVIDER_NAME = 'TEST_KEYSTORE',
      KEY_PATH = 'some-arbitrary-keypath'
    );`, (err) => {
      if (err) {
        return cb(err);
      }
      const request = new Request(`CREATE COLUMN ENCRYPTION KEY [CEK1] WITH VALUES (
        COLUMN_MASTER_KEY = [CMK1],
        ALGORITHM = 'RSA_OAEP',
        ENCRYPTED_VALUE = 0xDEADBEEF
      );`, (err) => {
        if (err) {
          return cb(err);
        }
        return cb();
      });
      connection.execSql(request);
    });
    connection.execSql(request);
  };

  const dropKeys = (cb) => {
    const request = new Request('IF OBJECT_ID(\'dbo.test_always_encrypted\', \'U\') IS NOT NULL DROP TABLE dbo.test_always_encrypted;', (err) => {
      if (err) {
        return cb(err);
      }

      const request = new Request('IF (SELECT COUNT(*) FROM sys.column_encryption_keys WHERE name=\'CEK1\') > 0 DROP COLUMN ENCRYPTION KEY [CEK1];', (err) => {
        if (err) {
          return cb(err);
        }

        const request = new Request('IF (SELECT COUNT(*) FROM sys.column_master_keys WHERE name=\'CMK1\') > 0 DROP COLUMN MASTER KEY [CMK1];', (err) => {
          if (err) {
            return cb(err);
          }

          cb();
        });
        connection.execSql(request);
      });
      connection.execSql(request);
    });
    connection.execSql(request);
  };

  beforeEach(function(done) {
    connection = new Connection(config);
    // connection.on('debug', (msg) => console.log(msg));
    connection.connect((err) => {
      if (err) {
        return done(err);
      }

      dropKeys((err) => {
        if (err) {
          return done(err);
        }

        createKeys(done);
      });
    });
  });

  afterEach(function(done) {
    if (!connection.closed) {
      dropKeys(() => {
        connection.on('end', done);
        connection.close();
      });
    } else {
      done();
    }
  });

  it('should not support text datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] text
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'text\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });

  it('should not support ntext datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] ntext
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'ntext\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });

  it('should not support image datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] image
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'image\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });

  it('should not support xml datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] xml
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'xml\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });

  it('should not support sysname datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] sysname
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'sysname\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });

  it('should not support timestamp datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] timestamp
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'timestamp\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });

  it('should not support sql_variant datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] sql_variant
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'sql_variant\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });

  it('should not support hierarchyid datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] hierarchyid
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'sys.hierarchyid\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });

  it('should not support geometry datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] geometry
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'sys.geometry\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });

  it('should not support geography datatype for encryption', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [col1] geography
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        assert.strictEqual(err.name, 'RequestError');
        assert.strictEqual(err.message, 'Cannot create encrypted column \'col1\' because type \'sys.geography\' is not supported for encryption.');
        return done();
      }

      return done(new Error('Test did not throw error as expected!'));
    });
    connection.execSql(request);
  });
});
