const Connection = require('../../../src/connection');
const Request = require('../../../src/request');
const TYPES = require('../../../src/data-type').typeByName;

const { assert } = require('chai');
const fs = require('fs');

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
config.options.encrypt = false;
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


const dropKeys = (connection, numberOfKeys, done, cb) => {
  if (numberOfKeys > 0) {
    const request = new Request(`
        if exists (SELECT name from sys.column_encryption_keys where name='CEK${numberOfKeys}')
        begin
        drop column encryption key CEK${numberOfKeys}
        end;
        `, (err) => {
      if (err) {
        return done(err);
      }
      numberOfKeys -= 1;
      dropKeys(connection, numberOfKeys, done, cb);
    });

    connection.execSql(request);
  } else {
    const request = new Request(`
            if exists (SELECT name from sys.column_master_keys where name='CMK1')
            begin
            drop column master key CMK1
            end;
        `, (err) => {
      if (err) {
        return done(err);
      }

      return cb();
    });

    connection.execSql(request);
  }
};

describe('always encrypted', function() {
  const numberOfKeys = 45;

  let connection;

  before(function() {
    if (config.options.tdsVersion < '7_4') {
      this.skip();
    }
  });

  beforeEach(function(done) {
    connection = new Connection(config);
    connection.connect((err) => {
      if (err) {
        return done(err);
      }

      const request = new Request('IF OBJECT_ID(\'dbo.test_always_encrypted\', \'U\') IS NOT NULL DROP TABLE dbo.test_always_encrypted;', (err) => {
        if (err) {
          return done(err);
        }
        dropKeys(connection, numberOfKeys, done, () => {

          const request = new Request(`if exists (SELECT name from sys.column_master_keys where name='CMK1')
                    begin
                    drop column master key CMK1
                    end;`, (err) => {
            if (err) {
              connection.close();
              return done(err);
            }
            const request = new Request(`CREATE COLUMN MASTER KEY [CMK1] WITH (
                    KEY_STORE_PROVIDER_NAME = 'TEST_KEYSTORE',
                    KEY_PATH = 'some-arbitrary-keypath'
                  );`, (err) => {
              if (err) {
                connection.close();
                return done(err);
              }
              return done();
            });
            connection.execSql(request);
          });

          connection.execSql(request);
        });
      });

      connection.execSql(request);
    });
  });

  afterEach(function(done) {
    if (!connection.closed) {
      const request = new Request('IF OBJECT_ID(\'dbo.test_always_encrypted\', \'U\') IS NOT NULL DROP TABLE dbo.test_always_encrypted;', (err) => {
        if (err) {
          return done(err);
        }
        dropKeys(connection, numberOfKeys, done, () => {

          connection.on('end', done);
          connection.close();
        });
      });

      connection.execSql(request);

    } else {
      done();
    }
  });

  it('should correctly insert/select the encrypted data', function(done) {
    this.timeout(30000);
    function createKeys(numberOfKeys, cb) {
      if (numberOfKeys > 0) {
        const request = new Request(`CREATE COLUMN ENCRYPTION KEY [CEK${numberOfKeys}] WITH VALUES (
                        COLUMN_MASTER_KEY = [CMK1],
                        ALGORITHM = 'RSA_OAEP',
                        ENCRYPTED_VALUE = 0xDEADBEEF
                      );`, (err) => {
          if (err) {
            return done(err);
          }
          numberOfKeys -= 1;
          createKeys(numberOfKeys, cb);
        });

        connection.execSql(request);
      } else {
        return cb();
      }
    }

    createKeys(numberOfKeys, () => {
      let sqlTableCreate = 'create table test_always_encrypted (';
      for (let i = numberOfKeys; i > 1; i--) {
        sqlTableCreate += 'c' + i + " nvarchar(50) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (ENCRYPTION_TYPE = RANDOMIZED, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = CEK" + i + ') NULL,';
      }

      sqlTableCreate += 'c' + 1 + " nvarchar(50) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (ENCRYPTION_TYPE = RANDOMIZED, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = CEK" + 1 + ') NULL ); ';

      const request = new Request(sqlTableCreate, (err) => {
        const value = 'nvarchar_determ_test_val123';
        if (err) {
          return done(err);
        }
        let sql = 'insert into test_always_encrypted values (';

        for (let i = numberOfKeys; i > 1; i--) {
          sql += `@p${i}, `;
        }

        sql += '@p1);';

        const request = new Request(sql, (err) => {
          if (err) {
            return done(err);
          }

          let values = [];
          const request2 = new Request('select * from test_always_encrypted', (err) => {
            if (err) {
              return done(err);
            }
            values.forEach((result) => assert.strictEqual(result, value));

            return done();
          });

          request2.on('row', (columns) => {
            values = columns.map((col) => col.value);
          });

          connection.execSql(request2);
          // return done();
        });

        for (let i = numberOfKeys; i > 0; i--) {
          request.addParameter(`p${i}`, TYPES.NVarChar, value);
        }

        connection.execSql(request);
      });

      connection.execSql(request);
    });
    // done();
  });
});
