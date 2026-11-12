import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { CryptographyClient } from '@azure/keyvault-keys';
import { assert } from 'chai';
import { generateKeyPairSync, randomBytes, type KeyObject } from 'crypto';

import Connection, { type ConnectionOptions } from '../../src/connection';
import Request, { type ParameterOptions, type RequestOptions } from '../../src/request';
import { RequestError } from '../../src/errors';
import { typeByName as TYPES, type DataType } from '../../src/data-type';
import { AzureKeyVaultKeyStoreProvider, RsaKeyStoreProvider, type ColumnEncryptionKeyStoreProvider } from '../../src/always-encrypted/key-store-provider';
import { type ColumnEncryptionOptions } from '../../src/always-encrypted/types';
import { type ColumnMetadata } from '../../src/token/colmetadata-token-parser';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

const ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256';

type Parameter = [name: string, type: DataType, value: unknown, options?: ParameterOptions | undefined];

interface Result {
  rows: unknown[][];
  columns: ColumnMetadata[][];
  outputs: { [name: string]: unknown };
  rowCount: number | undefined;
}

function getConfig(options: ConnectionOptions = {}) {
  return {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION,
      ...options
    }
  };
}

function connect(options?: ConnectionOptions): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const connection = new Connection(getConfig(options));
    connection.connect((err) => {
      if (err) {
        return reject(err);
      }

      resolve(connection);
    });
  });
}

function close(connection: Connection | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (connection === undefined || connection.closed) {
      return resolve();
    }

    connection.on('end', resolve);
    connection.close();
  });
}

type Execute = 'execSql' | 'execSqlBatch' | 'callProcedure';

/**
 * Executes a request, and collects what it returns.
 */
function run(connection: Connection, method: Execute, sql: string, parameters: Parameter[] = [], options?: RequestOptions): Promise<Result> {
  return new Promise((resolve, reject) => {
    const result: Result = { rows: [], columns: [], outputs: {}, rowCount: undefined };

    const request = new Request(sql, (err, rowCount) => {
      if (err) {
        return reject(err);
      }

      result.rowCount = rowCount;
      resolve(result);
    }, options);

    for (const [name, type, value, options] of parameters) {
      request.addParameter(name, type, value, options);
    }

    request.on('columnMetadata', (columns) => {
      result.columns.push(columns as ColumnMetadata[]);
    });

    request.on('row', (columns) => {
      result.rows.push((columns as { value: unknown }[]).map((column) => column.value));
    });

    request.on('returnValue', (name, value) => {
      result.outputs[name] = value;
    });

    connection[method](request);
  });
}

function execSql(connection: Connection, sql: string, parameters?: Parameter[], options?: RequestOptions) {
  return run(connection, 'execSql', sql, parameters, options);
}

function execSqlBatch(connection: Connection, sql: string, options?: RequestOptions) {
  return run(connection, 'execSqlBatch', sql, [], options);
}

function callProcedure(connection: Connection, procedure: string, parameters?: Parameter[], options?: RequestOptions) {
  return run(connection, 'callProcedure', procedure, parameters, options);
}

async function rejection(promise: Promise<unknown>): Promise<any> {
  let result;
  try {
    result = await promise;
  } catch (error) {
    return error;
  }

  assert.fail(`Expected the request to fail, but it returned ${JSON.stringify(result)}`);
}

/**
 * A key store provider that counts how often it is asked to decrypt a key.
 */
class CountingKeyStoreProvider implements ColumnEncryptionKeyStoreProvider {
  calls = 0;

  constructor(private provider: ColumnEncryptionKeyStoreProvider) {}

  decryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer) {
    this.calls += 1;
    return this.provider.decryptColumnEncryptionKey(masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey);
  }
}

function date(value: string, nanosecondsDelta?: number): Date {
  const date = new Date(value);
  if (nanosecondsDelta !== undefined) {
    Object.defineProperty(date, 'nanosecondDelta', { enumerable: false, value: nanosecondsDelta });
  }
  return date;
}

function assertValue(actual: unknown, expected: unknown, message: string) {
  if (expected instanceof Date) {
    assert.instanceOf(actual, Date, message);
    assert.strictEqual((actual as Date).toISOString(), expected.toISOString(), message);
    assert.strictEqual((actual as any).nanosecondsDelta ?? 0, (expected as any).nanosecondDelta ?? 0, message);
  } else if (Buffer.isBuffer(expected)) {
    assert.isTrue(Buffer.isBuffer(actual), message);
    assert.strictEqual((actual as Buffer).toString('hex'), expected.toString('hex'), message);
  } else {
    assert.strictEqual(actual, expected, message);
  }
}

interface TypeTest {
  /**
   * The declaration of the column.
   */
  column: string;

  type: DataType;
  options?: ParameterOptions;

  /**
   * The values to round trip. A `[value, expected]` pair if the value is
   * expected to be returned differently than it is sent.
   */
  values: unknown[];
}

const BIN2 = 'COLLATE Latin1_General_BIN2';

const typeTests: { [name: string]: TypeTest } = {
  'bit': { column: 'bit', type: TYPES.Bit, values: [true, false] },
  'tinyint': { column: 'tinyint', type: TYPES.TinyInt, values: [0, 1, 255] },
  'smallint': { column: 'smallint', type: TYPES.SmallInt, values: [0, 1, -1, 32767, -32768] },
  'int': { column: 'int', type: TYPES.Int, values: [0, 1, -1, 2147483647, -2147483648] },
  'bigint': { column: 'bigint', type: TYPES.BigInt, values: [['0', '0'], ['-1', '-1'], ['9223372036854775807', '9223372036854775807'], ['-9223372036854775808', '-9223372036854775808']] },
  'real': { column: 'real', type: TYPES.Real, values: [0, 1.5, -1234.5] },
  'float': { column: 'float', type: TYPES.Float, values: [0, 1.5, -1234.56789, 1.7976931348623157e308] },
  'smallmoney': { column: 'smallmoney', type: TYPES.SmallMoney, values: [0, 1234.5678, -1234.5678, 214748.3647, -214748.3648] },
  'money': { column: 'money', type: TYPES.Money, values: [0, 1234.5678, -1234.5678, 123456789012.1234, -123456789012.1234] },
  'decimal(9, 2)': { column: 'decimal(9, 2)', type: TYPES.Decimal, options: { precision: 9, scale: 2 }, values: [0, 1234567.89, -1234567.89] },
  'decimal(18, 4)': { column: 'decimal(18, 4)', type: TYPES.Decimal, options: { precision: 18, scale: 4 }, values: [12345.6789, -12345.6789] },
  'numeric(28, 0)': { column: 'numeric(28, 0)', type: TYPES.Numeric, options: { precision: 28, scale: 0 }, values: [1e20, -1e20] },
  'numeric(38, 10)': { column: 'numeric(38, 10)', type: TYPES.Numeric, options: { precision: 38, scale: 10 }, values: [12345.6789, -12345.6789] },
  'uniqueidentifier': { column: 'uniqueidentifier', type: TYPES.UniqueIdentifier, values: ['01234567-89AB-CDEF-0123-456789ABCDEF'] },
  'date': { column: 'date', type: TYPES.Date, values: [date('2020-02-29T00:00:00Z'), date('0001-01-01T00:00:00Z'), date('9999-12-31T00:00:00Z')] },
  'time(7)': { column: 'time(7)', type: TYPES.Time, options: { scale: 7 }, values: [date('1970-01-01T12:34:56.123Z'), date('1970-01-01T00:00:00Z'), date('1970-01-01T23:59:59.999Z', 0.0009999)] },
  'time(3)': { column: 'time(3)', type: TYPES.Time, options: { scale: 3 }, values: [date('1970-01-01T12:34:56.123Z')] },
  'time(0)': { column: 'time(0)', type: TYPES.Time, options: { scale: 0 }, values: [date('1970-01-01T12:34:56Z')] },
  'datetime2(7)': { column: 'datetime2(7)', type: TYPES.DateTime2, options: { scale: 7 }, values: [date('2020-02-29T12:34:56.123Z'), date('0001-01-01T00:00:00Z'), date('9999-12-31T23:59:59.999Z', 0.0009999)] },
  'datetime2(3)': { column: 'datetime2(3)', type: TYPES.DateTime2, options: { scale: 3 }, values: [date('2020-02-29T12:34:56.123Z')] },
  'datetime2(0)': { column: 'datetime2(0)', type: TYPES.DateTime2, options: { scale: 0 }, values: [date('2020-02-29T12:34:56Z')] },
  'datetimeoffset(7)': { column: 'datetimeoffset(7)', type: TYPES.DateTimeOffset, options: { scale: 7 }, values: [date('2020-02-29T12:34:56.123Z')] },
  'datetimeoffset(2)': { column: 'datetimeoffset(2)', type: TYPES.DateTimeOffset, options: { scale: 2 }, values: [date('2020-02-29T12:34:56.120Z')] },
  'datetime': { column: 'datetime', type: TYPES.DateTime, values: [date('2020-02-29T12:34:56.123Z'), date('1753-01-01T00:00:00Z')] },
  'smalldatetime': { column: 'smalldatetime', type: TYPES.SmallDateTime, values: [date('2020-02-29T12:34:00Z'), date('1900-01-01T00:00:00Z')] },
  'char(10)': { column: `char(10) ${BIN2}`, type: TYPES.Char, options: { length: 10 }, values: [['abc', 'abc       '], ['0123456789', '0123456789']] },
  'varchar(50)': { column: `varchar(50) ${BIN2}`, type: TYPES.VarChar, options: { length: 50 }, values: ['', 'hello world', 'x'.repeat(50)] },
  'varchar(8000)': { column: `varchar(8000) ${BIN2}`, type: TYPES.VarChar, options: { length: 8000 }, values: ['hello world', 'x'.repeat(8000)] },
  'varchar(max)': { column: `varchar(max) ${BIN2}`, type: TYPES.VarChar, options: { length: Infinity }, values: ['', 'hello world', 'x'.repeat(100000)] },
  'nchar(10)': { column: `nchar(10) ${BIN2}`, type: TYPES.NChar, options: { length: 10 }, values: [['äbc', 'äbc       ']] },
  'nvarchar(50)': { column: `nvarchar(50) ${BIN2}`, type: TYPES.NVarChar, options: { length: 50 }, values: ['', 'hello wörld ☃ 😀', 'ö'.repeat(50)] },
  'nvarchar(4000)': { column: `nvarchar(4000) ${BIN2}`, type: TYPES.NVarChar, options: { length: 4000 }, values: ['ö'.repeat(4000)] },
  'nvarchar(max)': { column: `nvarchar(max) ${BIN2}`, type: TYPES.NVarChar, options: { length: Infinity }, values: ['', 'hello wörld', 'ö'.repeat(100000)] },
  'binary(10)': { column: 'binary(10)', type: TYPES.Binary, options: { length: 10 }, values: [[Buffer.from([1, 2, 3]), Buffer.from([1, 2, 3, 0, 0, 0, 0, 0, 0, 0])]] },
  'varbinary(50)': { column: 'varbinary(50)', type: TYPES.VarBinary, options: { length: 50 }, values: [Buffer.alloc(0), Buffer.from([1, 2, 3, 0]), Buffer.alloc(50, 0xAB)] },
  'varbinary(8000)': { column: 'varbinary(8000)', type: TYPES.VarBinary, options: { length: 8000 }, values: [Buffer.alloc(8000, 0xAB)] },
  'varbinary(max)': { column: 'varbinary(max)', type: TYPES.VarBinary, options: { length: Infinity }, values: [Buffer.alloc(0), Buffer.alloc(100000, 0xAB)] }
};

describe('Always Encrypted', function() {
  this.timeout(60000);

  // The names of the objects created by the tests are unique to a run, so
  // that runs against the same database do not get in each others way.
  const suffix = randomBytes(6).toString('hex');
  const names = {
    cmk: `tedious_cmk_${suffix}`,
    rotatedCmk: `tedious_cmk2_${suffix}`,
    cek: `tedious_cek_${suffix}`,
    rotatedCek: `tedious_cek2_${suffix}`,
    retiredCek: `tedious_cek3_${suffix}`,
    table: `tedious_ae_${suffix}`,
    typesTable: `tedious_ae_types_${suffix}`,
    rotatedTable: `tedious_ae_rotated_${suffix}`,
    retiredTable: `tedious_ae_retired_${suffix}`,
    procedure: `tedious_ae_proc_${suffix}`
  };

  const keyPath = `tedious/test/${suffix}`;
  const rotatedKeyPath = `tedious/test/rotated/${suffix}`;

  let privateKey: KeyObject;
  let rotatedPrivateKey: KeyObject;
  let provider: RsaKeyStoreProvider;

  let columnEncryption: ColumnEncryptionOptions;
  let connection: Connection;

  // The schema that the objects of the tests are created in.
  let schema: string;

  // Connections to close and objects to drop once the tests are done
  // (or failed to set up).
  let setupConnection: Connection | undefined;
  const cleanup: string[] = [];

  function encrypted(key: string, type: 'DETERMINISTIC' | 'RANDOMIZED') {
    return `ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = ${key}, ENCRYPTION_TYPE = ${type}, ALGORITHM = '${ALGORITHM}')`;
  }

  before(async function() {
    if (process.env.TEDIOUS_TDS_VERSION && process.env.TEDIOUS_TDS_VERSION < '7_4') {
      return this.skip();
    }

    setupConnection = await connect();

    // Always Encrypted was introduced with SQL Server 2016. Azure SQL
    // Database and Azure SQL Managed Instance (engine editions 5 and 8)
    // support it as well, but have version numbers of their own.
    const { rows: [[majorVersion, engineEdition, defaultSchema]] } = await execSqlBatch(setupConnection, `
      SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS int), CAST(SERVERPROPERTY('EngineEdition') AS int), SCHEMA_NAME()
    `);
    const isAzureSql = engineEdition === 5 || engineEdition === 8;
    if (!isAzureSql && majorVersion !== null && (majorVersion as number) < 13) {
      return this.skip();
    }

    schema = defaultSchema as string;

    ({ privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
    ({ privateKey: rotatedPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
    provider = new RsaKeyStoreProvider({ [keyPath]: privateKey, [rotatedKeyPath]: rotatedPrivateKey });

    columnEncryption = { keyStoreProviders: { TEDIOUS_TEST: provider } };

    try {
      await execSqlBatch(setupConnection, `CREATE COLUMN MASTER KEY ${names.cmk} WITH (KEY_STORE_PROVIDER_NAME = 'TEDIOUS_TEST', KEY_PATH = '${keyPath}')`);
    } catch (error: any) {
      // The tests need to be allowed to set up the keys they use.
      if (/permission/i.test(error.message)) {
        console.log(`      Skipping the Always Encrypted tests: ${error.message}`);
        return this.skip();
      }

      throw error;
    }
    cleanup.unshift(`DROP COLUMN MASTER KEY ${names.cmk}`);

    await execSqlBatch(setupConnection, `CREATE COLUMN MASTER KEY ${names.rotatedCmk} WITH (KEY_STORE_PROVIDER_NAME = 'TEDIOUS_TEST', KEY_PATH = '${rotatedKeyPath}')`);
    cleanup.unshift(`DROP COLUMN MASTER KEY ${names.rotatedCmk}`);

    const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', randomBytes(32));
    await execSqlBatch(setupConnection, `CREATE COLUMN ENCRYPTION KEY ${names.cek} WITH VALUES (COLUMN_MASTER_KEY = ${names.cmk}, ALGORITHM = 'RSA_OAEP', ENCRYPTED_VALUE = 0x${encryptedKey.toString('hex')})`);
    cleanup.unshift(`DROP COLUMN ENCRYPTION KEY ${names.cek}`);

    await execSqlBatch(setupConnection, `
      CREATE TABLE ${names.table} (
        id int NOT NULL PRIMARY KEY,
        plain nvarchar(50) NULL,
        deterministic nvarchar(50) ${BIN2} ${encrypted(names.cek, 'DETERMINISTIC')} NULL,
        randomized int ${encrypted(names.cek, 'RANDOMIZED')} NULL
      )
    `);
    cleanup.unshift(`DROP TABLE ${names.table}`);

    const typeColumns = Object.values(typeTests).flatMap(({ column }, index) => [
      `d${index} ${column} ${encrypted(names.cek, 'DETERMINISTIC')} NULL`,
      `r${index} ${column} ${encrypted(names.cek, 'RANDOMIZED')} NULL`
    ]);
    await execSqlBatch(setupConnection, `CREATE TABLE ${names.typesTable} (id int IDENTITY NOT NULL PRIMARY KEY, ${typeColumns.join(', ')})`);
    cleanup.unshift(`DROP TABLE ${names.typesTable}`);
  });

  after(async function() {
    try {
      for (const sql of cleanup) {
        await execSqlBatch(setupConnection!, sql);
      }
    } finally {
      await close(setupConnection);
    }
  });

  beforeEach(async function() {
    connection = await connect({ columnEncryption });
    await execSqlBatch(connection, `DELETE FROM ${names.table}`);
  });

  afterEach(async function() {
    await close(connection);
  });

  describe('data types', function() {
    Object.entries(typeTests).forEach(([name, { type, options, values }], index) => {
      for (const [encryptionType, column] of [['deterministic', `d${index}`], ['randomized', `r${index}`]]) {
        it(`round trips \`${name}\` values of a column with ${encryptionType} encryption`, async function() {
          for (const entry of [...values, null]) {
            const [value, expected] = Array.isArray(entry) ? entry : [entry, entry];

            const { rows: [[id]] } = await execSql(connection, `INSERT INTO ${names.typesTable} (${column}) OUTPUT inserted.id VALUES (@value)`, [
              ['value', type, value, options]
            ]);

            const { rows: [[actual]], columns: [[metadata]] } = await execSql(connection, `SELECT ${column} FROM ${names.typesTable} WHERE id = @id`, [
              ['id', TYPES.Int, id]
            ]);

            const description = `${name} value ${String(value).slice(0, 40)}`;
            assertValue(actual, expected, description);
            assert.strictEqual(metadata.cryptoMetadata?.encryptionType, encryptionType);

            // Equal values encrypt to equal values with deterministic
            // encryption, which is what allows to look them up.
            if (encryptionType === 'deterministic' && value !== null) {
              const { rows } = await execSql(connection, `SELECT id FROM ${names.typesTable} WHERE ${column} = @value AND id = @id`, [
                ['value', type, value, options],
                ['id', TYPES.Int, id]
              ]);

              assert.deepEqual(rows, [[id]], description);
            }
          }
        });
      }
    });
  });

  describe('result sets', function() {
    beforeEach(async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, plain, deterministic, randomized) VALUES (@id, @plain, @deterministic, @randomized)`, [
        ['id', TYPES.Int, 1],
        ['plain', TYPES.NVarChar, 'plain'],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }],
        ['randomized', TYPES.Int, 42]
      ]);
    });

    it('describes encrypted columns by the type of their decrypted values', async function() {
      const { rows, columns: [columns] } = await execSqlBatch(connection, `SELECT * FROM ${names.table}`);

      assert.deepEqual(rows, [[1, 'plain', 'secret', 42]]);
      assert.deepEqual(columns.map((column) => column.type.name), ['Int', 'NVarChar', 'NVarChar', 'IntN']);
      assert.deepEqual(columns.map((column) => column.colName), ['id', 'plain', 'deterministic', 'randomized']);

      assert.isUndefined(columns[0].cryptoMetadata);
      assert.isUndefined(columns[1].cryptoMetadata);

      assert.strictEqual(columns[2].dataLength, 100);
      assert.strictEqual(columns[2].cryptoMetadata!.encryptionType, 'deterministic');
      assert.strictEqual(columns[2].cryptoMetadata!.algorithmId, 2);
      assert.strictEqual(columns[2].cryptoMetadata!.key!.values[0].keyStoreName, 'TEDIOUS_TEST');
      assert.strictEqual(columns[2].cryptoMetadata!.key!.values[0].keyPath, keyPath);
      assert.strictEqual(columns[2].cryptoMetadata!.key!.values[0].algorithm, 'RSA_OAEP');

      assert.strictEqual(columns[3].cryptoMetadata!.encryptionType, 'randomized');
    });

    it('returns encrypted values as they are stored on a connection without column encryption', async function() {
      const plain = await connect();

      try {
        const { rows: [row], columns: [columns] } = await execSqlBatch(plain, `SELECT * FROM ${names.table}`);

        assert.deepEqual(columns.map((column) => column.type.name), ['Int', 'NVarChar', 'VarBinary', 'VarBinary']);
        assert.isUndefined(columns[2].cryptoMetadata);

        assert.strictEqual(row[0], 1);
        assert.strictEqual(row[1], 'plain');
        assert.isTrue(Buffer.isBuffer(row[2]));
        assert.isTrue(Buffer.isBuffer(row[3]));
        assert.strictEqual((row[3] as Buffer)[0], 0x01);
      } finally {
        await close(plain);
      }
    });

    it('returns encrypted values as they are stored for requests with column encryption disabled', async function() {
      for (const method of ['execSqlBatch', 'execSql'] as const) {
        const { rows: [row], columns: [columns] } = await run(connection, method, `SELECT * FROM ${names.table}`, [], { columnEncryption: 'disabled' });

        assert.deepEqual(columns.map((column) => column.type.name), ['Int', 'NVarChar', 'VarBinary', 'VarBinary']);
        assert.isUndefined(columns[2].cryptoMetadata);
        assert.isTrue(Buffer.isBuffer(row[2]));
        assert.isTrue(Buffer.isBuffer(row[3]));
      }

      // The connection decrypts again afterwards.
      const { rows } = await execSqlBatch(connection, `SELECT deterministic, randomized FROM ${names.table}`);
      assert.deepEqual(rows, [['secret', 42]]);
    });

    it('decrypts the results of requests with column encryption limited to result sets', async function() {
      const { rows } = await execSql(connection, `SELECT deterministic, randomized FROM ${names.table} WHERE id = @id`, [
        ['id', TYPES.Int, 1]
      ], { columnEncryption: 'resultSetOnly' });

      assert.deepEqual(rows, [['secret', 42]]);

      // ... but does not encrypt their parameters, which the server rejects.
      const error = await rejection(execSql(connection, `SELECT id FROM ${names.table} WHERE deterministic = @value`, [
        ['value', TYPES.NVarChar, 'secret', { length: 50 }]
      ], { columnEncryption: 'resultSetOnly' }));

      // The server reports that the types of the operands clash.
      const [operandClash] = error.errors;
      assert.instanceOf(operandClash, RequestError);
      assert.strictEqual(operandClash.code, 'EREQUEST');
      assert.strictEqual(operandClash.number, 206);
      assert.match(operandClash.message, /encrypted with/);
    });

    it('decrypts all rows and result sets of a response', async function() {
      await execSql(connection, `
        INSERT INTO ${names.table} (id, deterministic, randomized)
        SELECT TOP 2000 1 + ROW_NUMBER() OVER (ORDER BY (SELECT NULL)), s.deterministic, s.randomized
        FROM ${names.table} s CROSS JOIN sys.all_columns
      `);

      const { rows, columns } = await execSqlBatch(connection, `
        SELECT id, deterministic, randomized FROM ${names.table} ORDER BY id;
        SELECT randomized, plain FROM ${names.table} WHERE id = 1;
        SELECT COUNT(*) FROM ${names.table};
      `);

      assert.lengthOf(columns, 3);
      assert.lengthOf(rows, 2001 + 1 + 1);

      rows.slice(0, 2001).forEach((row, index) => {
        assert.deepEqual(row, [index + 1, 'secret', 42]);
      });
      assert.deepEqual(rows[2001], [42, 'plain']);
      assert.deepEqual(rows[2002], [2001]);
    });

    it('decrypts rows with `null` values', async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic, randomized) VALUES (2, NULL, NULL)`);
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic, randomized) VALUES (@id, @deterministic, @randomized)`, [
        ['id', TYPES.Int, 3],
        ['deterministic', TYPES.NVarChar, null, { length: 50 }],
        ['randomized', TYPES.Int, null]
      ]);

      const { rows } = await execSqlBatch(connection, `SELECT id, plain, deterministic, randomized FROM ${names.table} ORDER BY id`);
      assert.deepEqual(rows, [[1, 'plain', 'secret', 42], [2, null, null, null], [3, null, null, null]]);
    });

    it('supports the `useColumnNames` option', async function() {
      const connection = await connect({ columnEncryption, useColumnNames: true });

      try {
        const row = await new Promise<any>((resolve, reject) => {
          let row: unknown;

          const request = new Request(`SELECT deterministic, randomized FROM ${names.table} WHERE deterministic = @value`, (err) => {
            if (err) {
              return reject(err);
            }

            resolve(row);
          });
          request.addParameter('value', TYPES.NVarChar, 'secret', { length: 50 });
          request.on('row', (columns) => {
            row = columns;
          });

          connection.execSql(request);
        });

        assert.strictEqual(row.deterministic.value, 'secret');
        assert.strictEqual(row.randomized.value, 42);
      } finally {
        await close(connection);
      }
    });

    it('collects decrypted rows with the `rowCollectionOnRequestCompletion` option', async function() {
      const connection = await connect({ columnEncryption, rowCollectionOnRequestCompletion: true });

      try {
        const rows = await new Promise<any[]>((resolve, reject) => {
          connection.execSql(new Request(`SELECT deterministic, randomized FROM ${names.table}`, (err, rowCount, rows) => {
            if (err) {
              return reject(err);
            }

            resolve(rows);
          }));
        });

        assert.deepEqual(rows.map((row) => row.map((column: any) => column.value)), [['secret', 42]]);
      } finally {
        await close(connection);
      }
    });
  });

  describe('parameters', function() {
    it('encrypts the parameters that target encrypted columns', async function() {
      const { rowCount } = await execSql(connection, `INSERT INTO ${names.table} (id, plain, deterministic, randomized) VALUES (@id, @plain, @deterministic, @randomized)`, [
        ['id', TYPES.Int, 1],
        ['plain', TYPES.NVarChar, 'plain'],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }],
        ['randomized', TYPES.Int, 42]
      ]);
      assert.strictEqual(rowCount, 1);

      const { rows } = await execSql(connection, `SELECT id, plain, randomized FROM ${names.table} WHERE deterministic = @value`, [
        ['value', TYPES.NVarChar, 'secret', { length: 50 }]
      ]);
      assert.deepEqual(rows, [[1, 'plain', 42]]);
    });

    it('does not reveal the values of encrypted parameters to the server', async function() {
      // Statements are only captured in the plan cache with their
      // parameters, so the values are looked for in what is stored.
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic, randomized) VALUES (@id, @deterministic, @randomized)`, [
        ['id', TYPES.Int, 1],
        ['deterministic', TYPES.NVarChar, 'top secret', { length: 50 }],
        ['randomized', TYPES.Int, 42]
      ]);

      const { rows: [[deterministic, randomized]] } = await execSqlBatch(connection, `SELECT deterministic, randomized FROM ${names.table}`, { columnEncryption: 'disabled' });

      assert.notInclude((deterministic as Buffer).toString('latin1'), Buffer.from('top secret', 'ucs2').toString('latin1'));
      assert.lengthOf(deterministic as Buffer, 1 + 32 + 16 + 32);
      assert.lengthOf(randomized as Buffer, 1 + 32 + 16 + 16);
    });

    it('produces equal values with deterministic and different values with randomized encryption', async function() {
      for (const id of [1, 2]) {
        await execSql(connection, `INSERT INTO ${names.table} (id, deterministic, randomized) VALUES (@id, @deterministic, @randomized)`, [
          ['id', TYPES.Int, id],
          ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }],
          ['randomized', TYPES.Int, 42]
        ]);
      }

      const { rows: [first, second] } = await execSqlBatch(connection, `SELECT deterministic, randomized FROM ${names.table} ORDER BY id`, { columnEncryption: 'disabled' });

      assert.deepEqual(first[0], second[0]);
      assert.notDeepEqual(first[1], second[1]);
    });

    it('fails requests whose parameters do not match the type of the encrypted column', async function() {
      const error = await rejection(execSql(connection, `INSERT INTO ${names.table} (id, randomized) VALUES (@id, @randomized)`, [
        ['id', TYPES.Int, 1],
        ['randomized', TYPES.NVarChar, '42']
      ]));

      const [operandClash] = error.errors;
      assert.instanceOf(operandClash, RequestError);
      assert.strictEqual(operandClash.code, 'EREQUEST');
      assert.strictEqual(operandClash.number, 206);
      assert.match(operandClash.message, /encrypted with/);

      // The connection can still be used.
      const { rows } = await execSqlBatch(connection, 'SELECT 1');
      assert.deepEqual(rows, [[1]]);
    });

    it('fails requests that force the encryption of a parameter that does not need to be encrypted', async function() {
      const error = await rejection(execSql(connection, `INSERT INTO ${names.table} (id, plain) VALUES (@id, @plain)`, [
        ['id', TYPES.Int, 1],
        ['plain', TYPES.NVarChar, 'sensitive', { forceEncrypt: true }]
      ]));

      assert.instanceOf(error, RequestError);
      assert.strictEqual(error.code, 'ECOLUMNENCRYPTION');
      assert.match(error.message, /"plain" is required to be encrypted/);

      const { rows } = await execSqlBatch(connection, `SELECT COUNT(*) FROM ${names.table}`);
      assert.deepEqual(rows, [[0]]);
    });

    it('encrypts parameters whose encryption is forced', async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
        ['id', TYPES.Int, 1],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50, forceEncrypt: true }]
      ]);

      const { rows } = await execSqlBatch(connection, `SELECT deterministic FROM ${names.table}`);
      assert.deepEqual(rows, [['secret']]);
    });

    it('fails requests that force the encryption of a parameter without column encryption', async function() {
      const plain = await connect();

      try {
        for (const [connectionToUse, options, reason] of [
          [plain, undefined, /"columnEncryption" option of the connection is not set/],
          [connection, { columnEncryption: 'resultSetOnly' }, /"columnEncryption" option of the request is "resultSetOnly"/],
          [connection, { columnEncryption: 'disabled' }, /"columnEncryption" option of the request is "disabled"/]
        ] as const) {
          const error = await rejection(execSql(connectionToUse, `INSERT INTO ${names.table} (id, plain) VALUES (@id, @plain)`, [
            ['id', TYPES.Int, 1],
            ['plain', TYPES.NVarChar, 'sensitive', { forceEncrypt: true }]
          ], options));

          assert.instanceOf(error, RequestError);
          assert.strictEqual(error.code, 'ECOLUMNENCRYPTION');
          assert.match(error.message, reason);
        }
      } finally {
        await close(plain);
      }
    });

    it('encrypts the parameters of statements executed within a transaction', async function() {
      await new Promise<void>((resolve, reject) => {
        connection.beginTransaction((err) => (err ? reject(err) : resolve()));
      });

      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
        ['id', TYPES.Int, 1],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ]);

      await new Promise<void>((resolve, reject) => {
        connection.rollbackTransaction((err) => (err ? reject(err) : resolve()));
      });

      const { rows } = await execSqlBatch(connection, `SELECT COUNT(*) FROM ${names.table}`);
      assert.deepEqual(rows, [[0]]);
    });

    it('encrypts the parameters of prepared statements', async function() {
      const request = new Request(`INSERT INTO ${names.table} (id, deterministic, randomized) VALUES (@id, @deterministic, @randomized)`, () => {});
      request.addParameter('id', TYPES.Int);
      request.addParameter('deterministic', TYPES.NVarChar, undefined, { length: 50 });
      request.addParameter('randomized', TYPES.Int);

      await new Promise<void>((resolve, reject) => {
        request.once('prepared', resolve);
        request.once('error', reject);
        connection.prepare(request);
      });

      for (const [id, deterministic, randomized] of [[1, 'first', 10], [2, 'second', 20], [3, null, null]]) {
        await new Promise<void>((resolve, reject) => {
          request.userCallback = (err) => (err ? reject(err) : resolve());
          connection.execute(request, { id, deterministic, randomized });
        });
      }

      await new Promise<void>((resolve) => {
        request.userCallback = () => resolve();
        connection.unprepare(request);
      });

      const { rows } = await execSqlBatch(connection, `SELECT id, deterministic, randomized FROM ${names.table} ORDER BY id`);
      assert.deepEqual(rows, [[1, 'first', 10], [2, 'second', 20], [3, null, null]]);
    });
  });

  describe('stored procedures', function() {
    before(async function() {
      await execSqlBatch(setupConnection!, `
        CREATE PROCEDURE ${names.procedure}
          @id int,
          @deterministic nvarchar(50),
          @randomized int OUTPUT,
          @echo nvarchar(50) OUTPUT
        AS
        BEGIN
          SET NOCOUNT ON;
          SELECT @randomized = randomized FROM ${names.table} WHERE id = @id AND deterministic = @deterministic;
          SELECT @echo = deterministic FROM ${names.table} WHERE id = @id;
          SELECT plain, deterministic FROM ${names.table} WHERE deterministic = @deterministic;
          RETURN 7;
        END
      `);
      cleanup.unshift(`DROP PROCEDURE ${names.procedure}`);
    });

    beforeEach(async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, plain, deterministic, randomized) VALUES (@id, @plain, @deterministic, @randomized)`, [
        ['id', TYPES.Int, 1],
        ['plain', TYPES.NVarChar, 'plain'],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }],
        ['randomized', TYPES.Int, 42]
      ]);
    });

    it('encrypts input parameters and decrypts output parameters', async function() {
      const { rows, outputs } = await callProcedure(connection, names.procedure, [
        ['id', TYPES.Int, 1],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }],
        ['randomized', TYPES.Int, null, { output: true }],
        ['echo', TYPES.NVarChar, null, { output: true, length: 50 }]
      ]);

      assert.deepEqual(rows, [['plain', 'secret']]);
      assert.deepEqual(outputs, { randomized: 42, echo: 'secret' });
    });

    it('returns `null` for encrypted output parameters that are not set', async function() {
      const { rows, outputs } = await callProcedure(connection, names.procedure, [
        ['id', TYPES.Int, 2],
        ['deterministic', TYPES.NVarChar, 'other', { length: 50 }],
        ['randomized', TYPES.Int, null, { output: true }],
        ['echo', TYPES.NVarChar, null, { output: true, length: 50 }]
      ]);

      assert.deepEqual(rows, []);
      assert.deepEqual(outputs, { randomized: null, echo: null });
    });

    it('returns large values for encrypted output parameters', async function() {
      const procedure = `${names.procedure}_large`;
      const table = `${names.table}_large`;

      await execSqlBatch(setupConnection!, `CREATE TABLE ${table} (id int NOT NULL, document nvarchar(max) ${BIN2} ${encrypted(names.cek, 'RANDOMIZED')} NULL, data varbinary(8000) ${encrypted(names.cek, 'RANDOMIZED')} NULL)`);
      cleanup.unshift(`DROP TABLE ${table}`);
      await execSqlBatch(setupConnection!, `
        CREATE PROCEDURE ${procedure} @id int, @document nvarchar(max) OUTPUT, @data varbinary(8000) OUTPUT
        AS SELECT @document = document, @data = data FROM ${table} WHERE id = @id
      `);
      cleanup.unshift(`DROP PROCEDURE ${procedure}`);

      // Values whose encrypted values are longer than 8000 bytes.
      const document = 'ö'.repeat(50000);
      const data = Buffer.alloc(8000, 0xAB);

      await execSql(connection, `INSERT INTO ${table} (id, document, data) VALUES (@id, @document, @data)`, [
        ['id', TYPES.Int, 1],
        ['document', TYPES.NVarChar, document, { length: Infinity }],
        ['data', TYPES.VarBinary, data, { length: 8000 }]
      ]);

      const { outputs } = await callProcedure(connection, procedure, [
        ['id', TYPES.Int, 1],
        ['document', TYPES.NVarChar, null, { output: true, length: Infinity }],
        ['data', TYPES.VarBinary, null, { output: true, length: 8000 }]
      ]);

      assert.strictEqual(outputs.document, document);
      assert.deepEqual(outputs.data, data);
    });

    it('supports schema qualified procedure names', async function() {
      const { outputs } = await callProcedure(connection, `[${schema}].[${names.procedure}]`, [
        ['id', TYPES.Int, 1],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }],
        ['randomized', TYPES.Int, null, { output: true }],
        ['echo', TYPES.NVarChar, null, { output: true, length: 50 }]
      ]);

      assert.deepEqual(outputs, { randomized: 42, echo: 'secret' });
    });
  });

  describe('parameter encryption metadata', function() {
    // Counts the requests that ask the server how to encrypt parameters.
    function countDescribeRequests(connection: Connection) {
      const counter = { count: 0 };

      const makeRequest = connection.makeRequest;
      connection.makeRequest = function(request, ...args) {
        if (request instanceof Request && request.sqlTextOrProcedure === 'sp_describe_parameter_encryption') {
          counter.count += 1;
        }

        return makeRequest.call(this, request, ...args);
      };

      return counter;
    }

    function insert(connection: Connection, id: number, options?: RequestOptions) {
      return execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
        ['id', TYPES.Int, id],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ], options);
    }

    it('asks the server how to encrypt the parameters of a statement only once', async function() {
      const counter = countDescribeRequests(connection);

      await insert(connection, 1);
      await insert(connection, 2);
      await insert(connection, 3);
      assert.strictEqual(counter.count, 1);

      // A different statement, whatever the length of its parameter is
      // declared as
      await execSql(connection, `SELECT id FROM ${names.table} WHERE deterministic = @deterministic`, [
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ]);
      await execSql(connection, `SELECT id FROM ${names.table} WHERE deterministic = @deterministic`, [
        ['deterministic', TYPES.NVarChar, 'secret', { length: 20 }]
      ]);
      assert.strictEqual(counter.count, 2);

      // The same statement with other parameters
      await execSql(connection, `SELECT id FROM ${names.table} WHERE deterministic = @deterministic`, [
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }],
        ['unused', TYPES.Int, 1]
      ]);
      assert.strictEqual(counter.count, 3);
    });

    it('asks the server only once for values of different lengths', async function() {
      const counter = countDescribeRequests(connection);

      // The length of a parameter that is not specified is that of its
      // value, which the parameter is declared with.
      const values = ['a', 'secret', 'x'.repeat(50), '', null];
      for (const [id, value] of values.entries()) {
        await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
          ['id', TYPES.Int, id],
          ['deterministic', TYPES.NVarChar, value]
        ]);
      }

      assert.strictEqual(counter.count, 1);

      const { rows } = await execSqlBatch(connection, `SELECT deterministic FROM ${names.table} ORDER BY id`);
      assert.deepEqual(rows, values.map((value) => [value]));
    });

    it('asks the server only once for parameters of other types and in another order', async function() {
      const counter = countDescribeRequests(connection);
      const sql = `INSERT INTO ${names.table} (id, plain, deterministic) VALUES (@id, @plain, @deterministic)`;

      await execSql(connection, sql, [
        ['id', TYPES.Int, 1],
        ['plain', TYPES.NVarChar, 'plain'],
        ['deterministic', TYPES.NVarChar, 'secret']
      ]);

      // The types of parameters that are derived from values differ from
      // one value to the next.
      await execSql(connection, sql, [
        ['deterministic', TYPES.NVarChar, null],
        ['plain', TYPES.VarChar, 'plain'],
        ['id', TYPES.BigInt, 2]
      ]);

      assert.strictEqual(counter.count, 1);

      const { rows } = await execSqlBatch(connection, `SELECT id, plain, deterministic FROM ${names.table} ORDER BY id`);
      assert.deepEqual(rows, [[1, 'plain', 'secret'], [2, 'plain', null]]);
    });

    it('leaves it to the server to reject parameters of a type that does not fit the column of a known statement', async function() {
      const counter = countDescribeRequests(connection);
      const sql = `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`;

      await execSql(connection, sql, [['id', TYPES.Int, 1], ['deterministic', TYPES.NVarChar, 'secret']]);
      assert.strictEqual(counter.count, 1);

      // The value is encrypted as the server asked for, but is not of the
      // type of the column.
      const error = await rejection(execSql(connection, sql, [['id', TYPES.Int, 2], ['deterministic', TYPES.Int, 42]]));
      const [serverError] = error.errors ?? [error];
      assert.strictEqual(serverError.code, 'EREQUEST');
      assert.match(serverError.message, /Operand type clash: int encrypted with/);
      assert.strictEqual(counter.count, 1);

      const { rows } = await execSqlBatch(connection, `SELECT id, deterministic FROM ${names.table} ORDER BY id`);
      assert.deepEqual(rows, [[1, 'secret']]);
    });

    it('leaves it to the server to reject values that do not fit the column of a known statement', async function() {
      const counter = countDescribeRequests(connection);
      const insertValue = (id: number, value: string) => {
        return execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
          ['id', TYPES.Int, id],
          ['deterministic', TYPES.NVarChar, value]
        ]);
      };

      await insertValue(1, 'secret');
      assert.strictEqual(counter.count, 1);

      // The server is not asked about the statement again, but refuses a
      // parameter that is longer than the column.
      const error = await rejection(insertValue(2, 'x'.repeat(51)));
      const [serverError] = error.errors ?? [error];
      assert.strictEqual(serverError.code, 'EREQUEST');
      assert.match(serverError.message, /Operand type clash: nvarchar\(51\) encrypted with/);
      assert.strictEqual(counter.count, 1);

      await insertValue(3, 'another secret');
      assert.strictEqual(counter.count, 2);

      const { rows } = await execSqlBatch(connection, `SELECT id, deterministic FROM ${names.table} ORDER BY id`);
      assert.deepEqual(rows, [[1, 'secret'], [3, 'another secret']]);
    });

    it('does not ask the server for statements without parameters', async function() {
      const counter = countDescribeRequests(connection);

      await execSql(connection, `SELECT * FROM ${names.table}`);
      await execSqlBatch(connection, `SELECT * FROM ${names.table}`);
      assert.strictEqual(counter.count, 0);
    });

    it('does not ask the server for requests that do not encrypt parameters', async function() {
      const counter = countDescribeRequests(connection);

      await execSql(connection, `SELECT * FROM ${names.table} WHERE id = @id`, [['id', TYPES.Int, 1]], { columnEncryption: 'resultSetOnly' });
      await execSql(connection, `SELECT * FROM ${names.table} WHERE id = @id`, [['id', TYPES.Int, 1]], { columnEncryption: 'disabled' });
      assert.strictEqual(counter.count, 0);
    });

    it('asks the server each time if the cache is disabled', async function() {
      const connection = await connect({ columnEncryption: { ...columnEncryption, parameterMetadataCacheSize: 0 } });

      try {
        const counter = countDescribeRequests(connection);

        await insert(connection, 1);
        await insert(connection, 2);
        assert.strictEqual(counter.count, 2);
      } finally {
        await close(connection);
      }
    });

    it('asks the server again after a request failed', async function() {
      const counter = countDescribeRequests(connection);

      await insert(connection, 1);
      assert.strictEqual(counter.count, 1);

      // Violates the primary key
      const error = await rejection(insert(connection, 1));
      assert.strictEqual(error.code, 'EREQUEST');

      await insert(connection, 2);
      assert.strictEqual(counter.count, 2);
    });

    it('asks the server again once the column master key of a statement was retired', async function() {
      // The column encryption key is protected by the first column master
      // key, which it is rotated away from below.
      const columnEncryptionKey = randomBytes(32);
      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);
      const rotatedEncryptedKey = await provider.encryptColumnEncryptionKey(rotatedKeyPath, 'RSA_OAEP', columnEncryptionKey);

      await execSqlBatch(setupConnection!, `CREATE COLUMN ENCRYPTION KEY ${names.retiredCek} WITH VALUES (COLUMN_MASTER_KEY = ${names.cmk}, ALGORITHM = 'RSA_OAEP', ENCRYPTED_VALUE = 0x${encryptedKey.toString('hex')})`);
      cleanup.unshift(`DROP COLUMN ENCRYPTION KEY ${names.retiredCek}`);

      await execSqlBatch(setupConnection!, `CREATE TABLE ${names.retiredTable} (id int NOT NULL, value int ${encrypted(names.retiredCek, 'DETERMINISTIC')} NULL)`);
      cleanup.unshift(`DROP TABLE ${names.retiredTable}`);

      // A key store that the first column master key is removed from. Keys
      // are not cached, like after the lifetime of the key cache passed.
      const retired = new Set<string>();
      const keyStore: ColumnEncryptionKeyStoreProvider = {
        async decryptColumnEncryptionKey(masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey) {
          if (retired.has(masterKeyPath.toLowerCase())) {
            throw new Error(`the key store does not have the key "${masterKeyPath}" anymore`);
          }

          return await provider.decryptColumnEncryptionKey(masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey);
        }
      };

      const connection = await connect({ columnEncryption: { keyStoreProviders: { TEDIOUS_TEST: keyStore }, keyCacheTTL: 0 } });

      try {
        const counter = countDescribeRequests(connection);
        const insertValue = (id: number) => {
          return execSql(connection, `INSERT INTO ${names.retiredTable} (id, value) VALUES (@id, @value)`, [['id', TYPES.Int, id], ['value', TYPES.Int, 42]]);
        };

        await insertValue(1);
        assert.strictEqual(counter.count, 1);

        await execSqlBatch(setupConnection!, `ALTER COLUMN ENCRYPTION KEY ${names.retiredCek} ADD VALUE (COLUMN_MASTER_KEY = ${names.rotatedCmk}, ALGORITHM = 'RSA_OAEP', ENCRYPTED_VALUE = 0x${rotatedEncryptedKey.toString('hex')})`);
        await execSqlBatch(setupConnection!, `ALTER COLUMN ENCRYPTION KEY ${names.retiredCek} DROP VALUE (COLUMN_MASTER_KEY = ${names.cmk})`);
        retired.add(keyPath.toLowerCase());

        // What the connection remembers of the statement refers to the
        // column master key that is gone.
        await insertValue(2);
        assert.strictEqual(counter.count, 2);

        await insertValue(3);
        assert.strictEqual(counter.count, 2);

        const { rows } = await execSqlBatch(connection, `SELECT id, value FROM ${names.retiredTable} ORDER BY id`);
        assert.deepEqual(rows, [[1, 42], [2, 42], [3, 42]]);
      } finally {
        await close(connection);
      }
    });

    it('asks the server only once more if the keys of a statement can not be decrypted', async function() {
      let available = true;
      const keyStore: ColumnEncryptionKeyStoreProvider = {
        async decryptColumnEncryptionKey(masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey) {
          if (!available) {
            throw new Error('the key store is not available');
          }

          return await provider.decryptColumnEncryptionKey(masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey);
        }
      };

      const connection = await connect({ columnEncryption: { keyStoreProviders: { TEDIOUS_TEST: keyStore }, keyCacheTTL: 0 } });

      try {
        const counter = countDescribeRequests(connection);

        await insert(connection, 1);
        assert.strictEqual(counter.count, 1);

        available = false;

        for (const count of [2, 3]) {
          const error = await rejection(insert(connection, 2));
          assert.instanceOf(error, RequestError);
          assert.strictEqual(error.code, 'ECOLUMNENCRYPTION');
          assert.match(error.message, /Failed to encrypt the parameters of the request: .*the key store is not available/);
          assert.strictEqual(counter.count, count);
        }

        available = true;

        await insert(connection, 2);
        assert.strictEqual(counter.count, 3);
      } finally {
        await close(connection);
      }
    });

    it('fails the request if the server can not describe its statement', async function() {
      const error = await rejection(execSql(connection, 'SELECT * FROM tedious_table_that_does_not_exist WHERE id = @id', [
        ['id', TYPES.Int, 1]
      ]));

      assert.instanceOf(error, RequestError);
      assert.strictEqual(error.code, 'EREQUEST');

      const { rows } = await execSqlBatch(connection, 'SELECT 1');
      assert.deepEqual(rows, [[1]]);
    });

    it('rejects other requests while the parameters of a request are being encrypted', async function() {
      const first = insert(connection, 1);
      const error = await rejection(insert(connection, 2));

      assert.instanceOf(error, RequestError);
      assert.strictEqual(error.code, 'EINVALIDSTATE');

      await first;

      const { rows } = await execSqlBatch(connection, `SELECT id FROM ${names.table}`);
      assert.deepEqual(rows, [[1]]);
    });

    it('cancels requests while the server is asked how to encrypt their parameters', async function() {
      const request = new Request(`INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, () => {});
      request.addParameter('id', TYPES.Int, 1);
      request.addParameter('deterministic', TYPES.NVarChar, 'secret', { length: 50 });

      const error = await new Promise<any>((resolve) => {
        request.userCallback = resolve;
        connection.execSql(request);
        request.cancel();
      });

      assert.instanceOf(error, RequestError);
      assert.strictEqual(error.code, 'ECANCEL');

      const { rows } = await execSqlBatch(connection, `SELECT COUNT(*) FROM ${names.table}`);
      assert.deepEqual(rows, [[0]]);

      // The request can be executed again.
      await new Promise<void>((resolve, reject) => {
        request.userCallback = (err) => (err ? reject(err) : resolve());
        connection.execSql(request);
      });

      assert.deepEqual((await execSqlBatch(connection, `SELECT COUNT(*) FROM ${names.table}`)).rows, [[1]]);
    });

    it('cancels requests via the connection while their parameters are being encrypted', async function() {
      const promise = insert(connection, 1);
      assert.isTrue(connection.cancel());

      const error = await rejection(promise);
      assert.instanceOf(error, RequestError);
      assert.strictEqual(error.code, 'ECANCEL');

      await insert(connection, 1);
    });
  });

  describe('column encryption keys', function() {
    async function insertAndSelect(connection: Connection, id: number) {
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
        ['id', TYPES.Int, id],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ]);

      const { rows } = await execSqlBatch(connection, `SELECT deterministic FROM ${names.table} WHERE id = ${id}`);
      assert.deepEqual(rows, [['secret']]);
    }

    it('decrypts a column encryption key once per key store provider', async function() {
      const provider = new CountingKeyStoreProvider(new RsaKeyStoreProvider({ [keyPath]: privateKey }));
      const options = { columnEncryption: { keyStoreProviders: { TEDIOUS_TEST: provider } } };

      const first = await connect(options);
      const second = await connect(options);

      try {
        await insertAndSelect(first, 1);
        await insertAndSelect(second, 2);
        await insertAndSelect(first, 3);

        assert.strictEqual(provider.calls, 1);
      } finally {
        await close(first);
        await close(second);
      }
    });

    it('decrypts a column encryption key each time if the cache is disabled', async function() {
      const provider = new CountingKeyStoreProvider(new RsaKeyStoreProvider({ [keyPath]: privateKey }));
      const connection = await connect({ columnEncryption: { keyStoreProviders: { TEDIOUS_TEST: provider }, keyCacheTTL: 0 } });

      try {
        await insertAndSelect(connection, 1);
        await insertAndSelect(connection, 2);

        assert.strictEqual(provider.calls, 4);
      } finally {
        await close(connection);
      }
    });

    it('fails requests if no key store provider is registered for a column master key', async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (1, NULL)`);

      const other = await connect({ columnEncryption: { keyStoreProviders: { OTHER: provider } } });

      try {
        let error = await rejection(execSqlBatch(other, `SELECT id, deterministic FROM ${names.table}`));
        assert.instanceOf(error, RequestError);
        assert.strictEqual(error.code, 'ECOLUMNENCRYPTION');
        assert.match(error.message, /No key store provider is registered for the key store "TEDIOUS_TEST"/);
        assert.match(error.message, /Registered key store providers: "OTHER"/);

        error = await rejection(execSql(other, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
          ['id', TYPES.Int, 2],
          ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
        ]));
        assert.instanceOf(error, RequestError);
        assert.strictEqual(error.code, 'ECOLUMNENCRYPTION');
        assert.match(error.message, /No key store provider is registered for the key store "TEDIOUS_TEST"/);

        // The connection is still usable, also for columns that are not encrypted.
        const { rows } = await execSqlBatch(other, `SELECT id, plain FROM ${names.table}`);
        assert.deepEqual(rows, [[1, null]]);
      } finally {
        await close(other);
      }
    });

    it('fails requests if the key store provider fails to decrypt a column encryption key', async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (1, NULL)`);

      const failing = await connect({
        columnEncryption: {
          keyStoreProviders: {
            TEDIOUS_TEST: {
              async decryptColumnEncryptionKey() {
                throw new Error('the key store is not available');
              }
            }
          }
        }
      });

      try {
        const emitted: unknown[] = [];
        const error = await new Promise<any>((resolve) => {
          const request = new Request(`SELECT id, deterministic FROM ${names.table}`, resolve);
          request.on('row', (row) => emitted.push(row));
          failing.execSqlBatch(request);
        });

        assert.instanceOf(error, RequestError);
        assert.strictEqual(error.code, 'ECOLUMNENCRYPTION');
        assert.match(error.message, /the key store is not available/);
        assert.strictEqual(((error.cause as Error).cause as Error).message, 'the key store is not available');
        assert.lengthOf(emitted, 0);

        const { rows } = await execSqlBatch(failing, 'SELECT 1');
        assert.deepEqual(rows, [[1]]);
      } finally {
        await close(failing);
      }
    });

    it('fails requests whose values can not be decrypted with the column encryption key', async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
        ['id', TYPES.Int, 1],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ]);

      // A key store that returns a different key than the values were
      // encrypted with.
      const wrong = await connect({
        columnEncryption: {
          keyStoreProviders: {
            TEDIOUS_TEST: {
              decryptColumnEncryptionKey() {
                return Buffer.alloc(32, 0x01);
              }
            }
          }
        }
      });

      try {
        const emitted: unknown[] = [];
        const error = await new Promise<any>((resolve) => {
          const request = new Request(`SELECT id, deterministic FROM ${names.table}; SELECT 2`, resolve);
          request.on('row', (row) => emitted.push((row as any[]).map((column) => column.value)));
          wrong.execSqlBatch(request);
        });

        assert.instanceOf(error, RequestError);
        assert.strictEqual(error.code, 'ECOLUMNENCRYPTION');
        assert.match(error.message, /invalid authentication tag/);

        // The rows of the result set that failed to decrypt are not
        // returned, those of others are.
        assert.deepEqual(emitted, [[2]]);

        const { rows } = await execSqlBatch(wrong, 'SELECT 1');
        assert.deepEqual(rows, [[1]]);
      } finally {
        await close(wrong);
      }
    });

    it('only uses column master keys with trusted key paths', async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (1, NULL)`);

      const trusting = await connect({ columnEncryption: { ...columnEncryption, trustedKeyPaths: [keyPath.toUpperCase()] } });
      const distrusting = await connect({ columnEncryption: { ...columnEncryption, trustedKeyPaths: ['some/other/key'] } });

      try {
        const { rows } = await execSqlBatch(trusting, `SELECT id, deterministic FROM ${names.table}`);
        assert.deepEqual(rows, [[1, null]]);

        // Even though the key was decrypted (and cached) before.
        const error = await rejection(execSqlBatch(distrusting, `SELECT id, deterministic FROM ${names.table}`));
        assert.instanceOf(error, RequestError);
        assert.strictEqual(error.code, 'ECOLUMNENCRYPTION');
        assert.match(error.message, /is not one of the trusted key paths/);
      } finally {
        await close(trusting);
        await close(distrusting);
      }
    });

    it('uses whichever column master key is available while a column master key is rotated', async function() {
      // The column encryption key is protected by the first column master
      // key, and by the one that it is being rotated to.
      const columnEncryptionKey = randomBytes(32);
      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);
      const rotatedEncryptedKey = await provider.encryptColumnEncryptionKey(rotatedKeyPath, 'RSA_OAEP', columnEncryptionKey);

      await execSqlBatch(setupConnection!, `CREATE COLUMN ENCRYPTION KEY ${names.rotatedCek} WITH VALUES (COLUMN_MASTER_KEY = ${names.cmk}, ALGORITHM = 'RSA_OAEP', ENCRYPTED_VALUE = 0x${encryptedKey.toString('hex')})`);
      cleanup.unshift(`DROP COLUMN ENCRYPTION KEY ${names.rotatedCek}`);
      await execSqlBatch(setupConnection!, `ALTER COLUMN ENCRYPTION KEY ${names.rotatedCek} ADD VALUE (COLUMN_MASTER_KEY = ${names.rotatedCmk}, ALGORITHM = 'RSA_OAEP', ENCRYPTED_VALUE = 0x${rotatedEncryptedKey.toString('hex')})`);

      await execSqlBatch(setupConnection!, `CREATE TABLE ${names.rotatedTable} (id int NOT NULL, value int ${encrypted(names.rotatedCek, 'DETERMINISTIC')} NULL)`);
      cleanup.unshift(`DROP TABLE ${names.rotatedTable}`);

      // Applications that have access to either of the column master keys
      // read and write the same values.
      const before = await connect({ columnEncryption: { keyStoreProviders: { TEDIOUS_TEST: new RsaKeyStoreProvider({ [keyPath]: privateKey }) } } });
      const after = await connect({ columnEncryption: { keyStoreProviders: { TEDIOUS_TEST: new RsaKeyStoreProvider({ [rotatedKeyPath]: rotatedPrivateKey }) } } });

      try {
        await execSql(before, `INSERT INTO ${names.rotatedTable} (id, value) VALUES (@id, @value)`, [['id', TYPES.Int, 1], ['value', TYPES.Int, 42]]);
        await execSql(after, `INSERT INTO ${names.rotatedTable} (id, value) VALUES (@id, @value)`, [['id', TYPES.Int, 2], ['value', TYPES.Int, 42]]);

        for (const connection of [before, after]) {
          const { rows, columns: [columns] } = await execSql(connection, `SELECT id, value FROM ${names.rotatedTable} WHERE value = @value ORDER BY id`, [['value', TYPES.Int, 42]]);

          assert.deepEqual(rows, [[1, 42], [2, 42]]);
          assert.lengthOf(columns[1].cryptoMetadata!.key!.values, 2);
        }
      } finally {
        await close(before);
        await close(after);
      }
    });
  });

  // Runs if `AZURE_KEY_VAULT_KEY_ID` is set to the identifier (the URL) of
  // an RSA key in an Azure Key Vault. The key is accessed with the service
  // principal given by the `AZURE_AD_SP_*` environment variables, or else
  // with the default Azure credential - either needs to be permitted to
  // wrap and unwrap keys, and to sign and verify, with the key.
  describe('with a column master key in Azure Key Vault', function() {
    const keyId = process.env.AZURE_KEY_VAULT_KEY_ID;

    const cmk = `tedious_akv_cmk_${suffix}`;
    const cek = `tedious_akv_cek_${suffix}`;
    const table = `tedious_akv_${suffix}`;

    let keyVault: AzureKeyVaultKeyStoreProvider;

    before(async function() {
      if (!keyId) {
        return this.skip();
      }

      const { AZURE_AD_SP_TENANT_ID: tenantId, AZURE_AD_SP_CLIENT_ID: clientId, AZURE_AD_SP_CLIENT_SECRET: clientSecret } = process.env;
      const credential = tenantId && clientId && clientSecret ? new ClientSecretCredential(tenantId, clientId, clientSecret) : new DefaultAzureCredential();

      keyVault = new AzureKeyVaultKeyStoreProvider((keyId) => new CryptographyClient(keyId, credential));

      await execSqlBatch(setupConnection!, `CREATE COLUMN MASTER KEY ${cmk} WITH (KEY_STORE_PROVIDER_NAME = 'AZURE_KEY_VAULT', KEY_PATH = '${keyId}')`);
      cleanup.unshift(`DROP COLUMN MASTER KEY ${cmk}`);

      const encryptedKey = await keyVault.encryptColumnEncryptionKey(keyId, 'RSA_OAEP', randomBytes(32));
      await execSqlBatch(setupConnection!, `CREATE COLUMN ENCRYPTION KEY ${cek} WITH VALUES (COLUMN_MASTER_KEY = ${cmk}, ALGORITHM = 'RSA_OAEP', ENCRYPTED_VALUE = 0x${encryptedKey.toString('hex')})`);
      cleanup.unshift(`DROP COLUMN ENCRYPTION KEY ${cek}`);

      await execSqlBatch(setupConnection!, `CREATE TABLE ${table} (id int NOT NULL, value nvarchar(50) ${BIN2} ${encrypted(cek, 'DETERMINISTIC')} NULL)`);
      cleanup.unshift(`DROP TABLE ${table}`);
    });

    it('encrypts and decrypts values', async function() {
      const connection = await connect({ columnEncryption: { keyStoreProviders: { AZURE_KEY_VAULT: keyVault } } });

      try {
        await execSql(connection, `INSERT INTO ${table} (id, value) VALUES (@id, @value)`, [
          ['id', TYPES.Int, 1],
          ['value', TYPES.NVarChar, 'secret', { length: 50 }]
        ]);

        const { rows, columns: [columns] } = await execSql(connection, `SELECT id, value FROM ${table} WHERE value = @value`, [
          ['value', TYPES.NVarChar, 'secret', { length: 50 }]
        ]);

        assert.deepEqual(rows, [[1, 'secret']]);
        assert.strictEqual(columns[1].cryptoMetadata!.key!.values[0].keyStoreName, 'AZURE_KEY_VAULT');
        assert.strictEqual(columns[1].cryptoMetadata!.key!.values[0].keyPath, keyId);
      } finally {
        await close(connection);
      }
    });
  });

  describe('while a key store is accessed', function() {
    // A key store that only answers once it is released.
    class GatedKeyStoreProvider implements ColumnEncryptionKeyStoreProvider {
      calls = 0;
      release!: () => void;

      private released = new Promise<void>((resolve) => {
        this.release = resolve;
      });

      async decryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer) {
        this.calls += 1;
        await this.released;
        return await provider.decryptColumnEncryptionKey(masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey);
      }
    }

    let gated: GatedKeyStoreProvider;
    let waiting: Connection;

    async function waitFor(condition: () => boolean) {
      while (!condition()) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    beforeEach(async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
        ['id', TYPES.Int, 1],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ]);

      gated = new GatedKeyStoreProvider();
      waiting = await connect({ columnEncryption: { keyStoreProviders: { TEDIOUS_TEST: gated }, keyCacheTTL: 0 } });
    });

    afterEach(async function() {
      gated.release();
      await close(waiting);
    });

    // Executes a request, and records what it emits and how it completes.
    function start(sql: string, parameters: Parameter[] = []) {
      const events: string[] = [];

      const request = new Request(sql, () => {});
      for (const [name, type, value, options] of parameters) {
        request.addParameter(name, type, value, options);
      }
      request.on('row', () => events.push('row'));
      request.on('done', () => events.push('done'));
      request.on('doneInProc', () => events.push('doneInProc'));

      const completed = new Promise<any>((resolve) => {
        request.userCallback = (err) => {
          events.push('callback');
          resolve(err);
        };
      });

      if (parameters.length > 0) {
        waiting.execSql(request);
      } else {
        waiting.execSqlBatch(request);
      }

      return { request, events, completed };
    }

    describe('to decrypt a result set', function() {
      it('completes a request that is canceled without waiting for the key store', async function() {
        const { request, events, completed } = start(`SELECT id, deterministic FROM ${names.table}`);
        await waitFor(() => gated.calls === 1);

        request.cancel();

        const error = await completed;
        assert.strictEqual(error.code, 'ECANCEL');

        // The connection is in use again by the time the key store answers.
        const { rows } = await execSqlBatch(waiting, 'SELECT 1');
        assert.deepEqual(rows, [[1]]);

        gated.release();
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.deepEqual(events, ['callback']);
      });

      it('fails a request whose connection is closed, and ignores the rest of its response', async function() {
        const { events, completed } = start(`SELECT id, deterministic FROM ${names.table}`);
        await waitFor(() => gated.calls === 1);

        waiting.close();

        const error = await completed;
        assert.strictEqual(error.code, 'ECLOSE');

        gated.release();
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.deepEqual(events, ['callback']);
      });

      it('decrypts the result set once the key store answered', async function() {
        const { events, completed } = start(`SELECT id, deterministic FROM ${names.table}`);
        await waitFor(() => gated.calls === 1);

        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.deepEqual(events, []);

        gated.release();

        assert.notExists(await completed);
        assert.deepEqual(events, ['row', 'done', 'callback']);
      });
    });

    describe('to encrypt parameters', function() {
      const sql = `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`;
      const parameters: Parameter[] = [
        ['id', TYPES.Int, 2],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ];

      async function assertNotInserted() {
        const { rows } = await execSqlBatch(connection, `SELECT COUNT(*) FROM ${names.table} WHERE id = 2`);
        assert.deepEqual(rows, [[0]]);
      }

      it('completes a request that is canceled without waiting for the key store', async function() {
        const { request, events, completed } = start(sql, parameters);
        await waitFor(() => gated.calls === 1);

        request.cancel();

        const error = await completed;
        assert.strictEqual(error.code, 'ECANCEL');

        // Other requests can be made, and the request is not sent later on.
        const { rows } = await execSqlBatch(waiting, 'SELECT 1');
        assert.deepEqual(rows, [[1]]);

        gated.release();
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.deepEqual(events, ['callback']);
        await assertNotInserted();
      });

      it('cancels a request via the connection', async function() {
        const { completed } = start(sql, parameters);
        await waitFor(() => gated.calls === 1);

        assert.isTrue(waiting.cancel());
        assert.strictEqual((await completed).code, 'ECANCEL');
      });

      it('fails a request that takes longer than its timeout', async function() {
        // The server is asked how to encrypt the parameters by a first
        // execution, so that the timeout only has the key store to wait for.
        const first = start(sql, parameters);
        await waitFor(() => gated.calls === 1);
        first.request.cancel();
        assert.strictEqual((await first.completed).code, 'ECANCEL');

        const request = new Request(sql, () => {});
        for (const [name, type, value, options] of parameters) {
          request.addParameter(name, type, value, options);
        }
        request.setTimeout(100);

        const error = await new Promise<any>((resolve) => {
          request.userCallback = resolve;
          waiting.execSql(request);
        });

        assert.strictEqual(error.code, 'ETIMEOUT');
        assert.strictEqual(error.message, 'Timeout: Request failed to complete in 100ms');
        assert.strictEqual(gated.calls, 2);

        gated.release();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await assertNotInserted();

        // The connection is still usable, and so is the request.
        request.setTimeout(undefined);
        await new Promise<void>((resolve, reject) => {
          request.userCallback = (err) => (err ? reject(err) : resolve());
          waiting.execSql(request);
        });
      });

      it('fails a request whose connection is closed', async function() {
        const { events, completed } = start(sql, parameters);
        await waitFor(() => gated.calls === 1);

        waiting.close();

        const error = await completed;
        assert.strictEqual(error.code, 'ECLOSE');

        gated.release();
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.deepEqual(events, ['callback']);
        await assertNotInserted();
      });
    });
  });

  describe('requests that do not involve encrypted columns', function() {
    it('supports bulk loads', async function() {
      const table = `#tedious_ae_bulk_${suffix}`;
      await execSqlBatch(connection, `CREATE TABLE ${table} (id int NOT NULL, name nvarchar(50) NULL)`);

      const rowCount = await new Promise<number | undefined>((resolve, reject) => {
        const bulkLoad = connection.newBulkLoad(table, (err, rowCount) => (err ? reject(err) : resolve(rowCount)));
        bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
        bulkLoad.addColumn('name', TYPES.NVarChar, { length: 50, nullable: true });

        connection.execBulkLoad(bulkLoad, [[1, 'one'], [2, 'two'], [3, null]]);
      });
      assert.strictEqual(rowCount, 3);

      const { rows } = await execSqlBatch(connection, `SELECT id, name FROM ${table} ORDER BY id`);
      assert.deepEqual(rows, [[1, 'one'], [2, 'two'], [3, null]]);
    });

    it('supports calling procedures with table-valued parameters whose type is not named', async function() {
      const type = `tedious_ae_tvp_${suffix}`;
      const procedure = `tedious_ae_tvp_proc_${suffix}`;

      await execSqlBatch(setupConnection!, `CREATE TYPE ${type} AS TABLE (a int)`);
      cleanup.unshift(`DROP TYPE ${type}`);
      await execSqlBatch(setupConnection!, `CREATE PROCEDURE ${procedure} @rows ${type} READONLY, @offset int AS SELECT a + @offset FROM @rows ORDER BY a`);
      cleanup.unshift(`DROP PROCEDURE ${procedure}`);

      const { rows } = await callProcedure(connection, procedure, [
        ['rows', TYPES.TVP, { columns: [{ name: 'a', type: TYPES.Int }], rows: [[1], [2]] }],
        ['offset', TYPES.Int, 10]
      ]);
      assert.deepEqual(rows, [[11], [12]]);

      const { rows: onlyRows } = await callProcedure(connection, procedure, [
        ['rows', TYPES.TVP, { columns: [{ name: 'a', type: TYPES.Int }], rows: [[1], [2]] }]
      ]).catch((error) => ({ rows: error.message }));
      assert.match(onlyRows as unknown as string, /expects parameter '@offset'/);
    });

    it('fails procedure calls that force the encryption of a table-valued parameter', async function() {
      const error = await rejection(callProcedure(connection, 'tedious_procedure_that_is_not_called', [
        ['rows', TYPES.TVP, { columns: [{ name: 'a', type: TYPES.Int }], rows: [[1]] }, { forceEncrypt: true }]
      ]));

      assert.instanceOf(error, RequestError);
      assert.strictEqual(error.code, 'ECOLUMNENCRYPTION');
      assert.strictEqual(error.message, 'The parameter "rows" is required to be encrypted (`forceEncrypt`), but table-valued parameters can not be encrypted.');
    });

    it('supports temporary tables, streamed values and output parameters', async function() {
      await execSqlBatch(connection, 'CREATE TABLE #t (id int, document nvarchar(max))');

      await execSql(connection, 'INSERT INTO #t (id, document) VALUES (@id, @document)', [
        ['id', TYPES.Int, 1],
        ['document', TYPES.NVarChar, (async function*() {
          yield 'streamed ';
          yield 'value';
        })()]
      ]);

      const { rows, outputs } = await execSql(connection, 'SELECT @length = LEN(document) FROM #t WHERE id = @id; SELECT document FROM #t', [
        ['id', TYPES.Int, 1],
        ['length', TYPES.Int, null, { output: true }]
      ]);

      assert.deepEqual(rows, [['streamed value']]);
      assert.deepEqual(outputs, { length: 14 });
    });

    it('clears the error of a previous execution of a request that is rejected', async function() {
      const request = new Request(`SELECT id FROM ${names.table} WHERE id = @id`, () => {});
      request.addParameter('id', TYPES.Int, 1);

      const other = await connect({ columnEncryption });
      await close(other);

      // Fails once, with an error of the server ...
      request.sqlTextOrProcedure = 'SELECT id FROM tedious_table_that_does_not_exist WHERE id = @id';
      const first = await new Promise<any>((resolve) => {
        request.userCallback = resolve;
        connection.execSql(request);
      });
      assert.strictEqual(first.code, 'EREQUEST');

      // ... and is then rejected by a connection that was closed.
      const second = await new Promise<any>((resolve) => {
        request.userCallback = resolve;
        other.execSql(request);
      });
      assert.strictEqual(second.code, 'EINVALIDSTATE');
      assert.isUndefined(request.error);
    });
  });

  describe('connection', function() {
    it('fails to connect with a TDS version that does not support column encryption', function() {
      assert.throws(() => {
        new Connection(getConfig({ columnEncryption, tdsVersion: '7_3_B' }));
      }, TypeError, 'The "config.options.columnEncryption" property requires "config.options.tdsVersion" to be "7_4".');
    });

    it('keeps encrypting after the connection was reset', async function() {
      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
        ['id', TYPES.Int, 1],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ]);

      await new Promise<void>((resolve, reject) => {
        connection.reset((err) => (err ? reject(err) : resolve()));
      });

      await execSql(connection, `INSERT INTO ${names.table} (id, deterministic) VALUES (@id, @deterministic)`, [
        ['id', TYPES.Int, 2],
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ]);

      const { rows } = await execSql(connection, `SELECT id FROM ${names.table} WHERE deterministic = @deterministic ORDER BY id`, [
        ['deterministic', TYPES.NVarChar, 'secret', { length: 50 }]
      ]);
      assert.deepEqual(rows, [[1], [2]]);
    });
  });
});
