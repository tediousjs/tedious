// The tedious side of the Always Encrypted compatibility checks between
// tedious and another driver. See README.md, and run.sh for how it is run.
import { appendFileSync, readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { Connection, Request, TYPES, RsaKeyStoreProvider } from '../../src/tedious';
import config from '../config';

function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`The environment variable ${name} is not set. This script is run by test/interop/run.sh.`);
  }
  return value;
}

// The driver that tedious is compared to. Microsoft's JDBC driver brings a
// key store provider of its own, for SqlClient the test registers one.
const OTHER = env('INTEROP_OTHER');
const PROVIDER = OTHER === 'jdbc' ? 'MSSQL_JAVA_KEYSTORE' : 'TEDIOUS_INTEROP';

// Each scenario has a database of its own.
const SCENARIO = process.argv[2] === 'wait' ? '' : env('INTEROP_SCENARIO');
const DATABASE = process.argv[2] === 'wait' ? '' : env('INTEROP_DATABASE');

const TABLE = 'interop';
const KEY_PATH = 'interop';
const CMK = 'interop_cmk';
// The column encryption key of the deterministically encrypted columns is
// encrypted by tedious, the one of the randomized columns by the other
// driver where it is able to: each driver has to decrypt what the other one
// encrypted.
const CEK_DETERMINISTIC = 'interop_cek_deterministic';
const CEK_RANDOMIZED = 'interop_cek_randomized';

// The row of a value of a column is `base + column * 100 + value`.
const OTHER_BASE = 0;
const TEDIOUS_BASE = 100000;
const NULL_VALUE = 99;

interface Column {
  index: number;
  name: string;
  sql: string;
  kind: string;
  params: number[];
  collation: string | undefined;
  writers: string[];
  in: string[];
  out: string[];
}

function expand(value: string): string {
  if (value === 'empty:') {
    return '';
  }

  const repeat = /^repeat:(.*):(\d+)$/.exec(value);
  if (repeat !== null) {
    return repeat[1].repeat(Number(repeat[2]));
  }

  return value;
}

function loadSpec(path: string): Column[] {
  return readFileSync(path, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#')).map((line, index) => {
    const [name, sql, kind, params, collation, writers, ...values] = line.split('\t');
    return {
      index,
      name,
      sql,
      kind,
      params: params === '-' ? [] : params.split(',').map(Number),
      collation: collation === '-' ? undefined : collation,
      writers: writers.split(','),
      in: values.map((value) => expand(value.split('=>')[0])),
      out: values.map((value) => expand(value.split('=>')[1] ?? value.split('=>')[0]))
    };
  });
}

const isWrittenBy = (column: Column, driver: string) => column.writers.includes('all') || column.writers.includes(driver);

function connect(options: { database?: string, provider?: RsaKeyStoreProvider } = {}): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        database: options.database ?? 'master',
        columnEncryption: options.provider && { keyStoreProviders: { [PROVIDER]: options.provider } }
      }
    });
    connection.connect((err) => (err ? reject(err) : resolve(connection)));
  });
}

type Parameter = [name: string, type: any, value: unknown, options?: any];

function run(connection: Connection, sql: string, parameters: Parameter[] = [], method: 'execSql' | 'execSqlBatch' = 'execSql'): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const rows: any[][] = [];
    const request = new Request(sql, (err) => (err ? reject(err) : resolve(rows)));
    for (const [name, type, value, options] of parameters) {
      request.addParameter(name, type, value, options);
    }
    request.on('row', (columns) => rows.push(columns.map((column: any) => column.value)));
    connection[method](request);
  });
}

const batch = (connection: Connection, sql: string) => run(connection, sql, [], 'execSqlBatch');

/**
 * A point in time in 100ns units: of a `YYYY-MM-DD hh:mm:ss.fffffff` text
 * (without the date for a time of day), in UTC.
 */
function unitsOf(text: string): bigint {
  const [, year = '1970', month = '01', day = '01', hours, minutes, seconds, fraction = ''] = /^(?:(\d{4})-(\d{2})-(\d{2}) )?(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?$/.exec(text)!;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
  return BigInt(ms) * 10000n + BigInt(fraction.padEnd(7, '0'));
}

// What is beyond the milliseconds of a date is given as `nanosecondDelta`
// with a parameter, and found as `nanosecondsDelta` on a date that was read.
function unitsOfDate(value: Date & { nanosecondsDelta?: number }): bigint {
  return BigInt(value.getTime()) * 10000n + BigInt(Math.round((value.nanosecondsDelta ?? 0) * 1e7));
}

function dateOf(text: string): Date {
  const units = unitsOf(text);
  const date: Date & { nanosecondDelta?: number } = new Date(Number(units / 10000n));
  date.nanosecondDelta = Number(units % 10000n) / 1e7;
  return date;
}

/** The parameter that holds a value of a column. */
function parameter(name: string, column: Column, text: string | null): Parameter {
  const [first, second] = column.params;

  switch (column.kind) {
    case 'bit': return [name, TYPES.Bit, text === null ? null : text === '1'];
    case 'tinyint': return [name, TYPES.TinyInt, text === null ? null : Number(text)];
    case 'smallint': return [name, TYPES.SmallInt, text === null ? null : Number(text)];
    case 'int': return [name, TYPES.Int, text === null ? null : Number(text)];
    case 'bigint': return [name, TYPES.BigInt, text];
    case 'real': return [name, TYPES.Real, text === null ? null : Number(text)];
    case 'float': return [name, TYPES.Float, text === null ? null : Number(text)];
    case 'decimal': return [name, TYPES.Decimal, text === null ? null : Number(text), { precision: first, scale: second }];
    case 'numeric': return [name, TYPES.Numeric, text === null ? null : Number(text), { precision: first, scale: second }];
    case 'money': return [name, TYPES.Money, text === null ? null : Number(text)];
    case 'smallmoney': return [name, TYPES.SmallMoney, text === null ? null : Number(text)];
    case 'char': return [name, TYPES.Char, text, { length: first }];
    case 'varchar': return [name, TYPES.VarChar, text, { length: first }];
    case 'varcharmax': return [name, TYPES.VarChar, text, { length: Infinity }];
    case 'nchar': return [name, TYPES.NChar, text, { length: first }];
    case 'nvarchar': return [name, TYPES.NVarChar, text, { length: first }];
    case 'nvarcharmax': return [name, TYPES.NVarChar, text, { length: Infinity }];
    case 'binary': return [name, TYPES.Binary, text === null ? null : Buffer.from(text, 'hex'), { length: first }];
    case 'varbinary': return [name, TYPES.VarBinary, text === null ? null : Buffer.from(text, 'hex'), { length: first }];
    case 'varbinarymax': return [name, TYPES.VarBinary, text === null ? null : Buffer.from(text, 'hex'), { length: Infinity }];
    case 'date': return [name, TYPES.Date, text === null ? null : new Date(`${text}T00:00:00Z`)];
    case 'time': return [name, TYPES.Time, text === null ? null : dateOf(text), { scale: first }];
    case 'datetime2': return [name, TYPES.DateTime2, text === null ? null : dateOf(text), { scale: first }];
    case 'datetimeoffset': return [name, TYPES.DateTimeOffset, text === null ? null : dateOf(text), { scale: first }];
    case 'datetime': return [name, TYPES.DateTime, text === null ? null : dateOf(text)];
    case 'smalldatetime': return [name, TYPES.SmallDateTime, text === null ? null : dateOf(text)];
    case 'guid': return [name, TYPES.UniqueIdentifier, text];
    default: throw new Error(`Unknown kind of column "${column.kind}".`);
  }
}

/** Returns undefined if a value that was read is the expected one, a description of it otherwise. */
function mismatch(column: Column, value: any, text: string | null): string | undefined {
  const describe = () => (value instanceof Date ? `${value.toISOString()} +${(value as any).nanosecondsDelta ?? 0}s` : Buffer.isBuffer(value) ? value.toString('hex') : JSON.stringify(value));

  if (text === null || value === null) {
    return value === null && text === null ? undefined : describe();
  }

  let equal;
  switch (column.kind) {
    case 'bit': equal = value === (text === '1'); break;
    case 'tinyint': case 'smallint': case 'int': equal = value === Number(text); break;
    case 'bigint': equal = String(value) === text; break;
    case 'real': equal = value === Math.fround(Number(text)); break;
    case 'float': case 'decimal': case 'numeric': case 'money': case 'smallmoney': equal = value === Number(text); break;
    // Padded with spaces, to the length of the type in bytes.
    case 'char': case 'nchar': equal = value.trimEnd() === text; break;
    case 'varchar': case 'varcharmax': case 'nvarchar': case 'nvarcharmax': equal = value === text; break;
    case 'binary': equal = value.toString('hex') === text.padEnd(column.params[0] * 2, '0'); break;
    case 'varbinary': case 'varbinarymax': equal = value.toString('hex') === text; break;
    case 'date': equal = value.toISOString() === `${text}T00:00:00.000Z`; break;
    case 'time': case 'datetime2': case 'datetimeoffset': case 'datetime': case 'smalldatetime': equal = unitsOfDate(value) === unitsOf(text); break;
    case 'guid': equal = String(value).toUpperCase() === text.toUpperCase(); break;
    default: throw new Error(`Unknown kind of column "${column.kind}".`);
  }

  return equal ? undefined : describe();
}

const shorten = (value: string | null) => (value === null ? 'null' : value.length > 60 ? `${value.slice(0, 60)}... (${value.length} chars)` : value);
const messageOf = (error: any) => (error.errors ?? [error]).map((e: any) => `${e.number !== undefined ? `#${e.number} ` : ''}${String(e.message)}`).join(' | ');

let failed = 0;
let passed = 0;

/**
 * Notes the outcome of a check: a line of the results file, that report.ts
 * compares with the known differences between the drivers.
 */
function record(check: string, column: string, value: number | null, error?: string) {
  if (error === undefined) {
    passed += 1;
  } else {
    failed += 1;
  }

  const message = (error ?? '').replace(/\s+/g, ' ').slice(0, 300);
  appendFileSync(env('INTEROP_RESULTS'), `${[SCENARIO, 'tedious', check, column, value ?? 'null', error === undefined ? 'ok' : 'fail', message].join('\t')}\n`);
}

/** Waits for SQL Server to accept connections, which takes a while after its container was started. */
async function wait() {
  const deadline = Date.now() + 120_000;

  for (;;) {
    try {
      (await connect()).close();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/** A database of the scenario's collation: it is the code page of the database that `varchar` parameters are sent in. */
async function createDatabase(create: boolean) {
  const connection = await connect();
  try {
    await batch(connection, `IF DB_ID('${DATABASE}') IS NOT NULL BEGIN ALTER DATABASE ${DATABASE} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${DATABASE}; END`);
    if (create) {
      await batch(connection, `CREATE DATABASE ${DATABASE} COLLATE ${env('INTEROP_COLLATION')}`);
    }
  } finally {
    connection.close();
  }
}

async function setup(columns: Column[], provider: RsaKeyStoreProvider) {
  const connection = await connect({ database: DATABASE });
  try {
    const [[version, collation]] = await batch(connection, "SELECT CAST(SERVERPROPERTY('ProductVersion') AS varchar(30)), CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS varchar(60))");
    console.log(`SQL Server ${version}, database collation ${collation}`);

    await batch(connection, `CREATE COLUMN MASTER KEY ${CMK} WITH (KEY_STORE_PROVIDER_NAME = '${PROVIDER}', KEY_PATH = '${KEY_PATH}')`);

    const byTedious = await provider.encryptColumnEncryptionKey(KEY_PATH, 'RSA_OAEP', randomBytes(32));
    const byOther = process.env.INTEROP_OTHER_CEK ?
      Buffer.from(readFileSync(process.env.INTEROP_OTHER_CEK, 'utf8').trim(), 'hex') :
      await provider.encryptColumnEncryptionKey(KEY_PATH, 'RSA_OAEP', randomBytes(32));

    await batch(connection, `CREATE COLUMN ENCRYPTION KEY ${CEK_DETERMINISTIC} WITH VALUES (COLUMN_MASTER_KEY = ${CMK}, ALGORITHM = 'RSA_OAEP', ENCRYPTED_VALUE = 0x${byTedious.toString('hex')})`);
    await batch(connection, `CREATE COLUMN ENCRYPTION KEY ${CEK_RANDOMIZED} WITH VALUES (COLUMN_MASTER_KEY = ${CMK}, ALGORITHM = 'RSA_OAEP', ENCRYPTED_VALUE = 0x${byOther.toString('hex')})`);

    // Each column of the spec twice: encrypted deterministically, and randomized.
    const encrypted = (key: string, type: string) => `ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = ${key}, ENCRYPTION_TYPE = ${type}, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256')`;
    const definitions = columns.flatMap((column) => {
      const type = `${column.sql}${column.collation ? ` COLLATE ${column.collation}` : ''}`;
      return [
        `${column.name}_d ${type} ${encrypted(CEK_DETERMINISTIC, 'DETERMINISTIC')} NULL`,
        `${column.name}_r ${type} ${encrypted(CEK_RANDOMIZED, 'RANDOMIZED')} NULL`
      ];
    });

    await batch(connection, `CREATE TABLE ${TABLE} (id int NOT NULL PRIMARY KEY, ${definitions.join(', ')})`);
  } finally {
    connection.close();
  }
}

/** Writes each value of each column, and a null. */
async function write(columns: Column[], provider: RsaKeyStoreProvider) {
  const connection = await connect({ database: DATABASE, provider });
  try {
    for (const column of columns.filter((column) => isWrittenBy(column, 'tedious'))) {
      for (const [v, text] of [...column.in, null].entries()) {
        const value = text === null ? null : v;
        const id = TEDIOUS_BASE + column.index * 100 + (value ?? NULL_VALUE);

        try {
          await run(connection, `INSERT INTO ${TABLE} (id, ${column.name}_d, ${column.name}_r) VALUES (@id, @d, @r)`, [['id', TYPES.Int, id], parameter('d', column, text), parameter('r', column, text)]);
          record('write', column.name, value);
        } catch (error: any) {
          record('write', column.name, value, `[${column.sql}] ${shorten(text)}: ${messageOf(error)}`);
        }
      }
    }
  } finally {
    connection.close();
  }
}

async function verify(columns: Column[], provider: RsaKeyStoreProvider) {
  const connection = await connect({ database: DATABASE, provider });
  // Sees the cells as they are stored.
  const plain = await connect({ database: DATABASE });

  try {
    for (const column of columns) {
      // Reads what the other driver wrote.
      if (isWrittenBy(column, OTHER)) {
        for (const [v, expected] of [...column.out, null].entries()) {
          const value = expected === null ? null : v;
          const id = OTHER_BASE + column.index * 100 + (value ?? NULL_VALUE);

          let rows: any[][] = [];
          let error;
          try {
            rows = await run(connection, `SELECT ${column.name}_d, ${column.name}_r FROM ${TABLE} WHERE id = @id`, [['id', TYPES.Int, id]]);
            if (rows.length === 0) {
              error = `${OTHER} did not write the row`;
            }
          } catch (err: any) {
            error = messageOf(err);
          }

          for (const [i, suffix] of ['_d', '_r'].entries()) {
            const actual = error === undefined ? mismatch(column, rows[0][i], expected) : undefined;
            record('read', column.name + suffix, value, error !== undefined ? `[${column.sql}] ${shorten(expected)}: ${error}` : actual !== undefined ? `[${column.sql}] expected ${shorten(expected)}, got ${shorten(actual)}` : undefined);
          }
        }
      }

      if (!isWrittenBy(column, OTHER) || !isWrittenBy(column, 'tedious')) {
        continue;
      }

      for (const [v, text] of column.in.entries()) {
        const ids = [OTHER_BASE + column.index * 100 + v, TEDIOUS_BASE + column.index * 100 + v];
        const describe = (error: string) => `[${column.sql}] ${shorten(text)}: ${error}`;

        // Deterministic encryption: both drivers have to come up with the
        // very same cell, which takes the very same bytes for the value.
        try {
          const rows = await batch(plain, `SELECT id, ${column.name}_d FROM ${TABLE} WHERE id IN (${ids.join(', ')}) ORDER BY id`);
          if (rows.length !== 2) {
            record('ciphertext', `${column.name}_d`, v, describe(`written by ${rows.map((row) => (row[0] < TEDIOUS_BASE ? OTHER : 'tedious')).join(' and ') || 'neither driver'} only`));
          } else if (!Buffer.isBuffer(rows[0][1]) || !Buffer.isBuffer(rows[1][1]) || !rows[0][1].equals(rows[1][1])) {
            record('ciphertext', `${column.name}_d`, v, describe(`the cells differ: ${rows[0][1]?.length} bytes of ${OTHER}, ${rows[1][1]?.length} bytes of tedious`));
          } else {
            record('ciphertext', `${column.name}_d`, v);
          }
        } catch (error: any) {
          record('ciphertext', `${column.name}_d`, v, describe(messageOf(error)));
        }

        // A lookup finds what either driver wrote.
        try {
          const rows = await run(connection, `SELECT id FROM ${TABLE} WHERE ${column.name}_d = @value ORDER BY id`, [parameter('value', column, text)]);
          const found = rows.map((row) => row[0]);
          record('lookup', `${column.name}_d`, v, ids.every((id) => found.includes(id)) ? undefined : describe(`expected rows ${ids.join(', ')}, found ${found.join(', ') || 'none'}`));
        } catch (error: any) {
          record('lookup', `${column.name}_d`, v, describe(messageOf(error)));
        }
      }
    }
  } finally {
    plain.close();
    connection.close();
  }
}

async function main(mode: string) {
  if (mode === 'wait') {
    return await wait();
  }

  switch (mode) {
    case 'createdb': return await createDatabase(true);
    case 'dropdb': return await createDatabase(false);
  }

  const columns = loadSpec(env('INTEROP_SPEC'));
  // The column master key: the very key that the other driver has.
  const provider = new RsaKeyStoreProvider({ [KEY_PATH]: readFileSync(env('INTEROP_KEY')) });

  switch (mode) {
    case 'setup': await setup(columns, provider); break;
    case 'write': await write(columns, provider); break;
    case 'verify': await verify(columns, provider); break;
    default: throw new Error(`Unknown mode "${mode}".`);
  }

  if (mode !== 'setup') {
    console.log(`tedious ${mode}: ${passed} passed, ${failed} failed`);
  }
}

main(process.argv[2]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
