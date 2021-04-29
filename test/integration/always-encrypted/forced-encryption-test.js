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


describe('forced encryption test', function() {
  let connection;


  before(function() {
    if (config.options.tdsVersion < '7_4') {
      this.skip();
    }
  });

  // storedProcedures
  const unencNumericProcedure = 'unencNumericProcedure';
  const encNumericProcedure = 'encNumericProcedure';
  // const unencStringProcedure = 'unencStringProcedure';
  // const encStringProcedure = 'encStringProcedure';
  const unencTimeProcedure = 'unencTimeProcedure';
  const encTimeProcedure = 'encTimeProcedure';
  // const unencObjectProcedure = 'unencObjectProcedure';
  // const encObjectProcedure = 'encObjectProcedure';
  const mixedEncProcedure = 'mixedEncProcedure';

  // tables
  const unencryptedNumeric = 'unencryptedNumeric';
  const encryptedNumeric = 'encryptedNumeric';
  const unencryptedString = 'unencryptedString';
  const encryptedString = 'encryptedString';
  const unencryptedTime = 'unencryptedTime';
  const encryptedTime = 'encryptedTime';
  const unencryptedObject = 'unencryptedObject';
  const encryptedObject = 'encryptedObject';
  const mixedEncTable = 'mixedEncTable';
  const tempTable = 'tempTable';

  const cekName = 'CEK_ForceEncryption';
  const cmkName1 = 'CMK1';

  const execRequestArray = (array, cb) => {
    if (array.length <= 0) {
      return cb();
    }
    const request = new Request(array[0], (err) => {
      if (err) {
        return cb(err);
      }
      array.shift();
      execRequestArray(array, cb);
    });
    connection.execSql(request);
  };

  const dropTables = (cb) => {
    const array = [];
    array.push("if object_id('" + tempTable + "','U') is not null drop table " + tempTable);
    array.push("if object_id('" + unencryptedNumeric + "','U') is not null drop table " + unencryptedNumeric);
    array.push("if object_id('" + encryptedNumeric + "','U') is not null drop table " + encryptedNumeric);
    array.push("if object_id('" + unencryptedString + "','U') is not null drop table " + unencryptedString);
    array.push("if object_id('" + encryptedString + "','U') is not null drop table " + encryptedString);
    array.push("if object_id('" + unencryptedTime + "','U') is not null drop table " + unencryptedTime);
    array.push("if object_id('" + encryptedTime + "','U') is not null drop table " + encryptedTime);
    array.push("if object_id('" + unencryptedObject + "','U') is not null drop table " + unencryptedObject);
    array.push("if object_id('" + encryptedObject + "','U') is not null drop table " + encryptedObject);
    array.push("if object_id('" + mixedEncTable + "','U') is not null drop table " + mixedEncTable);

    execRequestArray(array, cb);
  };

  const dropKeys = (cb) => {
    const array = [];
    array.push(" if exists (SELECT name from sys.column_encryption_keys where name='" + cekName + "')" +
      ' begin' +
      ' drop column encryption key ' + cekName +
      ' end');

    array.push(`IF (SELECT COUNT(*) FROM sys.column_master_keys WHERE name='${cmkName1}') > 0 DROP COLUMN MASTER KEY [${cmkName1}];`);

    execRequestArray(array, cb);
  };

  const createKeys = (cb) => {
    const array = [];
    array.push(`CREATE COLUMN MASTER KEY [${cmkName1}] WITH (
      KEY_STORE_PROVIDER_NAME = 'TEST_KEYSTORE',
      KEY_PATH = 'some-arbitrary-keypath'
    );`);

    array.push(`CREATE COLUMN ENCRYPTION KEY [${cekName}] WITH VALUES (
      COLUMN_MASTER_KEY = [${cmkName1}],
      ALGORITHM = 'RSA_OAEP',
      ENCRYPTED_VALUE = 0xDEADBEEF
    );`);

    execRequestArray(array, cb);
  };

  const createTables = (cb) => {
    const createTempTable = 'create table ' + tempTable + ' (' +
      'col1 bigint NULL,' +
      ');';
    const createMixedTable = 'create table ' + mixedEncTable + ' (' +
      "bit bit ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "tinyint tinyint ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      'smallint smallint NULL,' +
      "bit2 bit ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "tinyint2 tinyint ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      'smallint2 smallint NULL,' +
      "decimal decimal ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL' +
      ');';

    const createObjectTables1 = 'create table ' + unencryptedObject + ' (' +
      'decimal1 decimal NULL,' +
      'decimal2 decimal NULL' +
      ');';

    const createObjectTables2 = 'create table ' + encryptedObject + ' (' +
      "decimal1 decimal ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "decimal2 decimal ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL' +
      ');';

    const createNumericTables1 = 'create table ' + unencryptedNumeric + ' (' +
      'bit bit NULL,' +
      'tinyint tinyint NULL,' +
      'smallint smallint NULL,' +
      'int int NULL,' +
      'bigint bigint NULL,' +
      'real real NULL,' +
      'float float NULL,' +
      'decimal decimal NULL' +
      ');';

    const createNumericTables2 = 'create table ' + encryptedNumeric + ' (' +
      "bit bit ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "tinyint tinyint ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "smallint smallint ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "int int ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "bigint bigint ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "real real ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "float float ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "decimal decimal ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL' +
      ');';

    const createStringTables1 = 'create table ' + unencryptedString + ' (' +
      'varchar varchar(12) NULL,' +
      'nvarchar nvarchar(12) NULL' +
      ');';

    const createStringTables2 = 'create table ' + encryptedString + ' (' +
      "varchar varchar(max) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "nvarchar nvarchar(50) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL' +
      ');';

    const createTimeTables1 = 'create table ' + unencryptedTime + ' (' +
      'date DATE NULL,' +
      'time TIME NULL,' +
      'datetime2 DATETIME2 NULL,' +
      'datetimeoffset DATETIMEOFFSET NULL' +
      ');';

    const createTimeTables2 = 'create table ' + encryptedTime + ' (' +
      "date DATE ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "time TIME ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "datetime2 DATETIME2 ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL,' +
      "datetimeoffset DATETIMEOFFSET ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = " + cekName + ') NULL' +
      ');';

    const array = [createTempTable,
                   createMixedTable,
                   createObjectTables1,
                   createObjectTables2,
                   createNumericTables1,
                   createNumericTables2,
                   createStringTables1,
                   createStringTables2,
                   createTimeTables1,
                   createTimeTables2
    ];

    execRequestArray(array, cb);
  };

  const forceEncryptTest = (sql_array, call_sql, values, expected, forceEncArray, expError, expErrMsg, table, addParamsArray, done, cb) => {
    execRequestArray(sql_array, (err) => {
      if (err) {
        return done(err);
      }

      const request = new Request(call_sql, (err) => {
        if (err) {
          if (expError) {
            assert.strictEqual(err.message, expErrMsg);
            return done();
          } else {
            return done(err);
          }
        }
        if (expError) {
          return done(new Error('Expected to throw Error. No error was thrown'));
        }
        let results = [];
        const sql = 'SELECT * FROM ' + table;
        const request = new Request(sql, (err) => {
          if (err) {
            return done(err);
          }
          try {
            assert.deepEqual(results, expected);
          } catch (err) {
            return done(err);
          }

          return cb();
        });

        request.on('row', (columns) => {
          results = columns.map((col) => col.value);
        });

        connection.execSql(request);
      });

      for (let i = 0; i < addParamsArray.length; i++) {
        const typesOptions = addParamsArray[i];
        const types = typesOptions[0];
        const options = typesOptions[1];
        const options_val = Object.assign(options, { forceEncrypt: forceEncArray[i] });
        request.addParameter(`p${i}`, types, values[i], options_val);
      }

      connection.execSql(request);
    });
  };

  beforeEach(function(done) {
    connection = new Connection(config);
    // connection.on('debug', console.log)
    connection.connect((err) => {
      if (err) {
        return done(err);
      }

      dropTables((err) => {
        if (err) {
          return done(err);
        }

        dropKeys((err) => {
          if (err) {
            return done(err);
          }

          createKeys((err) => {
            if (err) {
              return done(err);
            }

            createTables(done);
          });
        });
      });
    });
  });

  afterEach(function(done) {
    if (!connection.closed) {
      dropTables((err) => {
        if (err) {
          return done(err);
        }
        dropKeys(() => {
          connection.on('end', done);
          connection.close();
        });
      });
    } else {
      done();
    }
  });

  it('should test Mixed Prepared Statement', function(done) {
    const sql = 'insert into [dbo].[' + mixedEncTable + '] values (@p0, @p1, @p2, @p3, @p4, @p5, @p6)';
    const values = [1, 1, 12, 0, 1, 12, 123456789123456789];
    const expected = [true, 1, 12, false, 1, 12, 123456789123456789];

    const addParamsArray = [
      [TYPES.Bit, {}],
      [TYPES.TinyInt, {}],
      [TYPES.SmallInt, {}],
      [TYPES.Bit, {}],
      [TYPES.TinyInt, {}],
      [TYPES.SmallInt, {}],
      [TYPES.Decimal, { precision: 18, scale: 0 }]
    ];

    const array1 = [true, true, false, true, true, false, true];
    const array2 = [false, false, false, false, false, false, false];
    const array3 = [true, true, true, true, true, false, false];
    const experrMsg = 'Cannot execute statement or procedure insert into [dbo].[mixedEncTable] values (@p0, @p1, @p2, @p3, @p4, @p5, @p6) because Force Encryption was set as true for parameter 3 and the database expects this parameter to be sent as plaintext. This may be due to a configuration error.';

    forceEncryptTest([], sql, values, expected, array1, false, '', mixedEncTable, addParamsArray, done, () => {
      forceEncryptTest([], sql, values, expected, array2, false, '', mixedEncTable, addParamsArray, done, () => {
        forceEncryptTest([], sql, values, expected, array3, true, experrMsg, mixedEncTable, addParamsArray, done, done);
      });
    });
  });

  it('should test Mixed Callable Statement', function(done) {
    const spName = mixedEncProcedure;
    const table = mixedEncTable;
    const drop_sql = " IF EXISTS (select * from sysobjects where id = object_id(N'" + spName + "') and OBJECTPROPERTY(id, N'IsProcedure') = 1)" +
      ' DROP PROCEDURE ' + spName;

    const create_sql = 'CREATE PROCEDURE ' + spName +
      ' (@p0 bit,' +
      ' @p1 tinyint,' +
      ' @p2 smallint,' +
      ' @p3 bit,' +
      ' @p4 tinyint,' +
      ' @p5 smallint,' +
      ' @p6 decimal)' +
      ' AS' +
      ' INSERT INTO ' + table +
      ' VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6)';

    const call_sql = 'exec dbo.' + spName + ' @p0, @p1, @p2, @p3, @p4, @p5, @p6';

    const values = [1, 1, 12, 0, 1, 12, 123456789123456789];
    const expected = [true, 1, 12, false, 1, 12, 123456789123456789];

    const addParamsArray = [
      [TYPES.Bit, {}],
      [TYPES.TinyInt, {}],
      [TYPES.SmallInt, {}],
      [TYPES.Bit, {}],
      [TYPES.TinyInt, {}],
      [TYPES.SmallInt, {}],
      [TYPES.Decimal, { precision: 18, scale: 0 }]
    ];

    const array1 = [true, true, false, true, true, false, true];
    const array2 = [false, false, false, false, false, false, false];
    const array3 = [true, true, true, true, true, false, false];
    const expErrMsg = 'Cannot execute statement or procedure exec dbo.mixedEncProcedure @p0, @p1, @p2, @p3, @p4, @p5, @p6 because Force Encryption was set as true for parameter 3 and the database expects this parameter to be sent as plaintext. This may be due to a configuration error.';


    forceEncryptTest([drop_sql, create_sql], call_sql, values, expected, array1, false, '', table, addParamsArray, done, () => {
      forceEncryptTest([drop_sql, create_sql], call_sql, values, expected, array2, false, '', table, addParamsArray, done, () => {
        forceEncryptTest([drop_sql, create_sql], call_sql, values, expected, array3, true, expErrMsg, table, addParamsArray, done, done);
      });
    });
  });

  it('should test Numeric Prepared Statement', function(done) {
    const unencTable = unencryptedNumeric;
    const encTable = encryptedNumeric;
    const call_sql = 'insert into [dbo].[' + unencTable + '] values(@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7)';
    const call_sql_enc = 'insert into [dbo].[' + encTable + '] values(@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7)';
    const values = [1, 127, 45, 5, 5858, 1.234, 456, 123456789123456789];
    const expected = [true, 127, 45, 5, '5858', 1.2339999675750732, 456, 123456789123456789];

    const addParamsArray = [
      [TYPES.Bit, {}],
      [TYPES.TinyInt, {}],
      [TYPES.SmallInt, {}],
      [TYPES.Int, {}],
      [TYPES.BigInt, {}],
      [TYPES.Real, {}],
      [TYPES.Float, {}],
      [TYPES.Decimal, { precision: 18, scale: 0 }],
    ];
    const array1 = [false, false, false, false, false, false, false, false];
    const array2 = [false, false, false, false, false, false, false, true];
    const array3 = [true, false, true, false, true, false, true, false];
    const expErrMsg = 'Cannot execute statement or procedure insert into [dbo].[unencryptedNumeric] values(@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7) because Force Encryption was set as true for parameter 8 and the database expects this parameter to be sent as plaintext. This may be due to a configuration error.';

    forceEncryptTest([], call_sql, values, expected, array1, false, null, unencTable, addParamsArray, done, () => {
      forceEncryptTest([], call_sql, values, expected, array2, true, expErrMsg, unencTable, addParamsArray, done, () => {
        forceEncryptTest([], call_sql_enc, values, expected, array1, false, null, encTable, addParamsArray, done, () => {
          forceEncryptTest([], call_sql_enc, values, expected, array3, false, null, encTable, addParamsArray, done, done);
        });
      });
    });
  });

  it('should test Numeric Callable Statement', function(done) {
    const unencTable = unencryptedNumeric;
    const encTable = encryptedNumeric;
    const spName_enc = encNumericProcedure;
    const spName_unenc = unencNumericProcedure;

    const drop_sql_enc = " IF EXISTS (select * from sysobjects where id = object_id(N'" + spName_enc + "') and OBJECTPROPERTY(id, N'IsProcedure') = 1)" +
      ' DROP PROCEDURE ' + spName_enc;
    const create_sql_enc = 'CREATE PROCEDURE ' + spName_enc +
      ' @p0 bit,' +
      ' @p1 tinyint,' +
      ' @p2 smallint,' +
      ' @p3 int,' +
      ' @p4 bigint,' +
      ' @p5 real,' +
      ' @p6 float,' +
      ' @p7 decimal' +
      ' AS' +
      ' INSERT INTO ' + encTable +
      ' VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7)';

    const drop_sql_unenc = " IF EXISTS (select * from sysobjects where id = object_id(N'" + spName_unenc + "') and OBJECTPROPERTY(id, N'IsProcedure') = 1)" +
      ' DROP PROCEDURE ' + spName_unenc;
    const create_sql_unenc = 'CREATE PROCEDURE ' + spName_unenc +
      ' @p0 bit,' +
      ' @p1 tinyint,' +
      ' @p2 smallint,' +
      ' @p3 int,' +
      ' @p4 bigint,' +
      ' @p5 real,' +
      ' @p6 float,' +
      ' @p7 decimal' +
      ' AS' +
      ' INSERT INTO ' + unencTable +
      ' VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7)';

    const call_sql_enc = 'exec dbo.' + spName_enc + ' @p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7';
    const call_sql_unenc = 'exec dbo.' + spName_unenc + ' @p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7';

    const values = [1, 127, 45, 5, 5858, 1.234, 456, 123456789123456789];
    const expected = [true, 127, 45, 5, '5858', 1.2339999675750732, 456, 123456789123456789];

    const addParamsArray = [
      [TYPES.Bit, {}],
      [TYPES.TinyInt, {}],
      [TYPES.SmallInt, {}],
      [TYPES.Int, {}],
      [TYPES.BigInt, {}],
      [TYPES.Real, {}],
      [TYPES.Float, {}],
      [TYPES.Decimal, {}],
    ];

    const array1 = [true, false, false, false, false, false, false];
    const array2 = [false, false, false, false, false, false, false];
    const expErrMsg = 'Cannot execute statement or procedure exec dbo.unencNumericProcedure @p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7 because Force Encryption was set as true for parameter 1 and the database expects this parameter to be sent as plaintext. This may be due to a configuration error.';

    forceEncryptTest([drop_sql_enc, create_sql_enc], call_sql_enc, values, expected, array1, false, null, encTable, addParamsArray, done, () => {
      forceEncryptTest([drop_sql_enc, create_sql_enc], call_sql_enc, values, expected, array2, false, null, encTable, addParamsArray, done, () => {
        forceEncryptTest([drop_sql_unenc, create_sql_unenc], call_sql_unenc, values, expected, array2, false, null, unencTable, addParamsArray, done, () => {
          forceEncryptTest([drop_sql_unenc, create_sql_unenc], call_sql_unenc, values, expected, array1, true, expErrMsg, unencTable, addParamsArray, done, done);
        });
      });
    });
  });

  xit('should test string prepared statement', function(done) {
    const encTable = encryptedString;
    // const unenctable = unencryptedString;

    const call_sql_enc = 'insert into [dbo].[' + encTable + '] values(@p0, @p1)';

    const values = ['hello world!', 'hello world!'];
    const expected = values;
    const addParamsArray = [
      [TYPES.VarChar, { collation: 'Latin1_General_BIN2' }],
      [TYPES.NVarChar, {}]
    ];

    const array1 = [true, true];
    const array2 = [false, false];
    forceEncryptTest([], call_sql_enc, values, expected, array1, false, null, encTable, addParamsArray, done, () => {
      forceEncryptTest([], call_sql_enc, values, expected, array2, false, null, encTable, addParamsArray, done, done);
    });
  });

  it('should test time prepared statement', function(done) {
    const encTable = encryptedTime;
    const unencTable = unencryptedTime;

    const call_sql_enc = 'insert into [dbo].[' + encTable + '] values(@p0, @p1, @p2, @p3)';
    const call_sql_unenc = 'insert into [dbo].[' + unencTable + '] values(@p0, @p1, @p2, @p3)';


    const dateObj = new Date(Date.UTC(2015, 5, 18));
    const timeObj = new Date(Date.UTC(1970, 1, 1, 12, 12, 12));
    const datetime2Obj = new Date('December 4, 2011 10:04:23 +00');
    const dateTimeOffsetObj = new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999));

    const values = [dateObj, timeObj, datetime2Obj, dateTimeOffsetObj];
    const expected = [dateObj, new Date(Date.UTC(1970, 0, 1, 12, 12, 12)), datetime2Obj, dateTimeOffsetObj];

    const addParamsArray = [
      [TYPES.Date, {}],
      [TYPES.Time, {}],
      [TYPES.DateTime2, {}],
      [TYPES.DateTimeOffset, {}],
    ];

    const array1 = [
      false,
      false,
      false,
      false
    ];
    const array2 = [
      true,
      true,
      true,
      true
    ];

    forceEncryptTest([], call_sql_unenc, values, expected, array1, false, null, unencTable, addParamsArray, done, () => {
      forceEncryptTest([], call_sql_enc, values, expected, array1, false, null, unencTable, addParamsArray, done, () => {
        forceEncryptTest([], call_sql_enc, values, expected, array2, false, null, unencTable, addParamsArray, done, done);
      });
    });
  });

  it('should test time callable statement', function(done) {
    const unencTable = unencryptedTime;
    const encTable = encryptedTime;
    const spName_enc = encTimeProcedure;
    const spName_unenc = unencTimeProcedure;

    const drop_sql_enc = " IF EXISTS (select * from sysobjects where id = object_id(N'" + spName_enc + "') and OBJECTPROPERTY(id, N'IsProcedure') = 1)" +
      ' DROP PROCEDURE ' + spName_enc;

    const create_sql_enc = 'CREATE PROCEDURE ' + spName_enc +
      ' @p0 DATE,' +
      ' @p1 TIME,' +
      ' @p2 DATETIME2,' +
      ' @p3 DATETIMEOFFSET' +
      ' AS' +
      ' INSERT INTO ' + encTable +
      ' VALUES (@p0,@p1,@p2,@p3)';

    const drop_sql_unenc = " IF EXISTS (select * from sysobjects where id = object_id(N'" + spName_unenc + "') and OBJECTPROPERTY(id, N'IsProcedure') = 1)" +
      ' DROP PROCEDURE ' + spName_unenc;

    const create_sql_unenc = 'CREATE PROCEDURE ' + spName_unenc +
      ' @p0 DATE,' +
      ' @p1 TIME,' +
      ' @p2 DATETIME2,' +
      ' @p3 DATETIMEOFFSET' +
      ' AS' +
      ' INSERT INTO ' + unencTable +
      ' VALUES (@p0,@p1,@p2,@p3)';

    const call_sql_enc = 'exec dbo.' + spName_enc + ' @p0, @p1, @p2, @p3';
    const call_sql_unenc = 'exec dbo.' + spName_unenc + ' @p0, @p1, @p2, @p3';

    const dateObj = new Date(Date.UTC(2015, 5, 18));
    const timeObj = new Date(Date.UTC(1970, 1, 1, 12, 12, 12));
    const datetime2Obj = new Date('December 4, 2011 10:04:23 +00');
    const dateTimeOffsetObj = new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999));

    const values = [dateObj, timeObj, datetime2Obj, dateTimeOffsetObj];
    const expected = [dateObj, new Date(Date.UTC(1970, 0, 1, 12, 12, 12)), datetime2Obj, dateTimeOffsetObj];
    const addParamsArray = [
      [TYPES.Date, {}],
      [TYPES.Time, {}],
      [TYPES.DateTime2, {}],
      [TYPES.DateTimeOffset, {}],
    ];

    const array1 = [
      false,
      false,
      false,
      false
    ];

    const array2 = [
      true,
      true,
      true,
      true
    ];

    const array3 = [
      true,
      false,
      false,
      false
    ];

    const expErrMsg = 'Cannot execute statement or procedure exec dbo.unencTimeProcedure @p0, @p1, @p2, @p3 because Force Encryption was set as true for parameter 1 and the database expects this parameter to be sent as plaintext. This may be due to a configuration error.';

    forceEncryptTest([drop_sql_enc, create_sql_enc], call_sql_enc, values, expected, array1, false, null, encTable, addParamsArray, done, () => {
      forceEncryptTest([drop_sql_enc, create_sql_enc], call_sql_enc, values, expected, array1, false, null, encTable, addParamsArray, done, () => {
        forceEncryptTest([drop_sql_enc, create_sql_enc], call_sql_enc, values, expected, array2, false, null, encTable, addParamsArray, done, () => {
          forceEncryptTest([drop_sql_unenc, create_sql_unenc], call_sql_unenc, values, expected, array3, true, expErrMsg, unencTable, addParamsArray, done, done);
        });
      });
    });
  });


});
