const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;

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
  this.timeout(100000);
  let connection;

  const dropKeys = (cb) => {
    const request = new Request(`IF OBJECT_ID('dbo.test_always_encrypted', 'U') IS NOT NULL DROP TABLE dbo.test_always_encrypted;`, (err) => {
      if (err) {
        console.log("err", err);
      }

      const request = new Request('DROP COLUMN ENCRYPTION KEY [CEK2];', (err) => {
        if (err) {
          console.log("err", err);
        }
  
        const request = new Request('DROP COLUMN MASTER KEY [CMK2];', (err) => {
          if (err) {
            console.log("err", err);
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
    connection.on('connect', done);
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

  it('should correctly insert/select the encrypted data', function(done) {
    const request = new Request(`CREATE COLUMN MASTER KEY CMK2 WITH (
      KEY_STORE_PROVIDER_NAME = 'TEST_KEYSTORE',
      KEY_PATH = 'some-arbitrary-keypath'
    );`, (err) => {
      if (err) {
        return done(err);
      }
      const request = new Request(`CREATE COLUMN ENCRYPTION KEY [CEK2] WITH VALUES (
        COLUMN_MASTER_KEY = [CMK1],
        ALGORITHM = 'RSA_OAEP',
        ENCRYPTED_VALUE = 0xDEADBEEF
      );`, (err) => {
        if (err) {
          return done(err);
        }
        const request = new Request(`CREATE TABLE test_always_encrypted (
          [plaintext]  nvarchar(50),
          [nvarchar_determ_test] nvarchar(50) COLLATE Latin1_General_BIN2 
          ENCRYPTED WITH (
            ENCRYPTION_TYPE = DETERMINISTIC,
            ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
            COLUMN_ENCRYPTION_KEY = [CEK2]
          ),
          [nvarchar_rand_test] nvarchar(50) COLLATE Latin1_General_BIN2 
          ENCRYPTED WITH (
            ENCRYPTION_TYPE = RANDOMIZED,
            ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
            COLUMN_ENCRYPTION_KEY = [CEK2]
          ),
          [int_test] int 
          ENCRYPTED WITH (
            ENCRYPTION_TYPE = DETERMINISTIC,
            ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
            COLUMN_ENCRYPTION_KEY = [CEK2]
          )
        );`, (err) => {
          if (err) {
            return done(err);
          }
          const p1 = 'nvarchar_determ_test_val123';
          const p2 = 'nvarchar_rand_test_val123';
          const p3 = 123;
          const p4 = 'plaintext_val123';
          const request = new Request('INSERT INTO test_always_encrypted ([nvarchar_determ_test], [nvarchar_rand_test], [int_test], [plaintext]) VALUES (@p1, @p2, @p3, @p4)', (err) => {
            if (err) {
              return done(err);
            }
            let values = [];
            const request = new Request('SELECT [nvarchar_determ_test], [nvarchar_rand_test], [int_test], [plaintext] FROM test_always_encrypted', (err) => {
              if (err) {
                return done(err);
              }
              assert.deepEqual(values, [p1, p2, p3, p4]);

              return done();
            });

            request.on('row', function(columns) {
              values = columns.map((col) => col.value);
            });

            connection.execSql(request);
          });

          request.addParameter('p1', TYPES.NVarChar, p1);
          request.addParameter('p2', TYPES.NVarChar, p2);
          request.addParameter('p3', TYPES.Int, p3);
          request.addParameter('p4', TYPES.NVarChar, p4);
          connection.execSql(request);
        });
        connection.execSql(request);
      });
      connection.execSql(request);
    });
    connection.execSql(request);
  });
});
