const Connection = require('../../../src/connection');
const Request = require('../../../src/request');

const fs = require('fs');
const { assert } = require('chai');
const RequestError = require('../../../src/errors').RequestError;

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
  const table1 = 'test_always_encrypted';
  const cekName = 'CEK1';

  before(function() {
    if (config.options.tdsVersion < '7_4') {
      this.skip();
    }
  });

  const createKeys = (done, cb) => {
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
        return cb(done);
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
        createKeys(done, (done) => {
          const sql = 'create table ' + table1 + ' (' +
                        'PlainChar char(20) null,' +
                        "RandomizedChar char(20) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (ENCRYPTION_TYPE = RANDOMIZED, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
                        "DeterministicChar char(20) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +

                        'PlainVarchar varchar(50) null,' +
                        "RandomizedVarchar varchar(50) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (ENCRYPTION_TYPE = RANDOMIZED, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
                        "DeterministicVarchar varchar(50) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL' +
                        ');';

          const request = new Request(sql, (err) => {
            if (err) {
              return done(err);
            }
            return done();
          });

          connection.execSql(request);
        });
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

  it('should throw Request Error on direct insert', function(done) {
    const test_insert_request = new Request(`insert into ${table1} (DeterministicVarchar) values ('hello world')`, (err) => {
      if (err) {
        try {
          assert.equal(err.message, 'Operand type clash: varchar is incompatible with varchar(8000) encrypted with (encryption_type = \'DETERMINISTIC\', encryption_algorithm_name = \'AEAD_AES_256_CBC_HMAC_SHA_256\', column_encryption_key_name = \'CEK1\', column_encryption_key_database_name = \'master\') collation_name = \'SQL_Latin1_General_CP1_CI_AS\'');
          assert.instanceOf(err, RequestError);
          return done();
        } catch (err) {
          return done(err);
        }

      }
      try {
        assert.fail('Request Error is not thrown when it should.');
        return done();
      } catch (err) {
        return done(err);
      }

    });

    connection.execSql(test_insert_request);
  });

  it('should throw Request Error on direct select', function(done) {
    const test_insert_request = new Request(`select * from ${table1} where DeterministicVarchar='hello world'`, (err) => {
      if (err) {
        try {
          assert.equal(err.message, 'Operand type clash: varchar is incompatible with varchar(8000) encrypted with (encryption_type = \'DETERMINISTIC\', encryption_algorithm_name = \'AEAD_AES_256_CBC_HMAC_SHA_256\', column_encryption_key_name = \'CEK1\', column_encryption_key_database_name = \'master\') collation_name = \'SQL_Latin1_General_CP1_CI_AS\'');
          assert.instanceOf(err, RequestError);
          return done();
        } catch (err) {
          return done(err);
        }
      }
      try {
        assert.fail('Request Error is not thrown when it should.');
        return done();
      } catch (err) {
        return done(err);
      }

    });

    connection.execSql(test_insert_request);
  });

  it('should throw Request Error on sp select', function(done) {
    const procedure1 = 'procedure1';
    const sql = " IF EXISTS (select * from sysobjects where id = object_id(N'" + procedure1 + "') and OBJECTPROPERTY(id, N'IsProcedure') = 1)" +
            ' DROP PROCEDURE ' + procedure1;

    const drop_prodecure1_request = new Request(sql, (err) => {
      if (err) {
        return done(err);
      }

      const sql = 'CREATE PROCEDURE ' + procedure1 +
                ' AS' +
                ' select * from ' + table1 + " where DeterministicVarchar='hello world'";

      const create_procedure1_request = new Request(sql, (err) => {
        if (err) {
          try {
            assert.equal(err.message, 'The data types varchar(50) encrypted with (encryption_type = \'DETERMINISTIC\', encryption_algorithm_name = \'AEAD_AES_256_CBC_HMAC_SHA_256\', column_encryption_key_name = \'CEK1\', column_encryption_key_database_name = \'master\') collation_name = \'Latin1_General_BIN2\' and varchar are incompatible in the equal to operator.');
            assert.instanceOf(err, RequestError);
            return done();
          } catch (err) {
            return done(err);
          }

        }
        try {
          assert.fail('Request Error is not thrown when it should.');
          return done();
        } catch (err) {
          return done(err);
        }
      });

      connection.execSql(create_procedure1_request);
    });

    connection.execSql(drop_prodecure1_request);
  });

  it('should throw Request Error on sp insert', function(done) {
    const procedure2 = 'procedure2';
    const sql = " IF EXISTS (select * from sysobjects where id = object_id(N'" + procedure2 + "') and OBJECTPROPERTY(id, N'IsProcedure') = 1)" +
            ' DROP PROCEDURE ' + procedure2;

    const drop_prodecure1_request = new Request(sql, (err) => {
      if (err) {
        return done(err);
      }

      const sql = 'CREATE PROCEDURE ' + procedure2 +
                ' AS' +
                ' insert into ' + table1 + " (DeterministicVarchar) values ('hello world')";

      const create_procedure1_request = new Request(sql, (err) => {
        if (err) {
          try {
            assert.equal(err.message, 'Operand type clash: varchar is incompatible with varchar(50) encrypted with (encryption_type = \'DETERMINISTIC\', encryption_algorithm_name = \'AEAD_AES_256_CBC_HMAC_SHA_256\', column_encryption_key_name = \'CEK1\', column_encryption_key_database_name = \'master\') collation_name = \'Latin1_General_BIN2\'');
            assert.instanceOf(err, RequestError);
            return done();
          } catch (err) {
            return done(err);
          }
        }
        try {
          assert.fail('Request Error is not thrown when it should.');
          return done();
        } catch (err) {
          return done(err);
        }
      });

      connection.execSql(create_procedure1_request);
    });

    connection.execSql(drop_prodecure1_request);
  });
});
