const Connection = require('../../../src/connection');
const Request = require('../../../src/request');
const TYPES = require('../../../src/data-type').typeByName;

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
  const rowCount = 5;
  let connection;

  const p1 = 'nvarchar_determ_test_val123';
  const p2 = 'nvarchar_rand_test_val123';
  const p3 = 123;
  const p4 = 'plaintext_val123';
  const p5 = new Date(Date.UTC(2020, 0, 1, 0, 0, 0, 0));
  const p6 = new Date(Date.UTC(2020, 0, 1, 1, 1, 1, 0));
  const p7 = new Date(Date.UTC(2020, 0, 1, 1, 1, 1, 1));
  const p8 = new Date(Date.UTC(2020, 0, 1, 1, 1, 1, 1));

  let parameters = [
    { paramName: 'p1', type: TYPES.NVarChar, value: p1 },
    { paramName: 'p2', type: TYPES.NVarChar, value: p2 },
    { paramName: 'p3', type: TYPES.Int, value: p3 },
    { paramName: 'p4', type: TYPES.NVarChar, value: p4 },
    { paramName: 'p5', type: TYPES.Date, value: p5 },
    { paramName: 'p6', type: TYPES.DateTime, value: p6 },
    { paramName: 'p7', type: TYPES.DateTime2, value: p7 },
    { paramName: 'p8', type: TYPES.DateTimeOffset, value: p8 },
  ];

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

  const shuffleArray = (array) => {
    const tempArray = [...array];
    for (let i = tempArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tempArray[i], tempArray[j]] = [tempArray[j], tempArray[i]];
    }

    return tempArray;
  };

  beforeEach(function(done) {
    connection = new Connection(config);
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


  it('should correctly insert/select the encrypted data', function(done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [plaintext]  nvarchar(50),
      [nvarchar_determ_test] nvarchar(50) COLLATE Latin1_General_BIN2
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = DETERMINISTIC,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      ),
      [nvarchar_rand_test] nvarchar(50) COLLATE Latin1_General_BIN2
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = RANDOMIZED,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      ),
      [int_test] int
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = DETERMINISTIC,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      ),
      [date_test] date
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = DETERMINISTIC,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      ),
      [datetime_test] datetime
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = DETERMINISTIC,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      ),
      [datetime2_test] datetime2
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = DETERMINISTIC,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      ),
      [datetimeoffset_test] datetimeoffset
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = DETERMINISTIC,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        return done(err);
      }

      const insert = (rowCount, cb) => {
        if (rowCount <= 0) {
          cb();
        } else {
          // shuffle addParameter order
          parameters = shuffleArray(parameters);

          // insert row
          const request = new Request('INSERT INTO test_always_encrypted ([nvarchar_determ_test], [nvarchar_rand_test], [int_test], [plaintext], [date_test], [datetime_test], [datetime2_test], [datetimeoffset_test]) VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8)', (err) => {
            if (err) {
              return done(err);
            }

            rowCount -= 1;
            insert(rowCount, cb);
          });
          for (const { paramName, type, value } of parameters) {
            request.addParameter(paramName, type, value);
          }
          connection.execSql(request);
        }
      };
      insert(rowCount, () => {
        // verify request.
        const values = [];
        const request = new Request(`SELECT TOP ${rowCount} [nvarchar_determ_test], [nvarchar_rand_test], [int_test], [plaintext], [date_test], [datetime_test], [datetime2_test], [datetimeoffset_test] FROM test_always_encrypted`, (err) => {
          if (err) {
            return done(err);
          }

          try {
            for (const row of values) {
              assert.deepEqual(row, [p1, p2, p3, p4, p5, p6, p7, p8]);
            }
          } catch (error) {
            return done(error);
          }

          return done();
        });

        request.on('row', function(columns) {
          values.push(columns.map((col) => col.value));
        });

        connection.execSql(request);
      });
    });
    connection.execSql(request);
  });
});
