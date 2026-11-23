import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { typeByName as TYPES } from '../../src/data-type';
import { encode } from '../../src/text-encoding';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  return {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION
    }
  };
}

// A collation for each code page tedious decodes.
const COLLATIONS: Array<[codepage: string, collation: string, doubleByte: boolean]> = [
  ['CP437', 'SQL_Latin1_General_CP437_CI_AS', false],
  ['CP850', 'SQL_Latin1_General_CP850_CI_AS', false],
  ['CP874', 'Thai_CI_AS', false],
  ['CP1250', 'Czech_CI_AS', false],
  ['CP1251', 'Cyrillic_General_CI_AS', false],
  ['CP1252', 'Latin1_General_CI_AS', false],
  ['CP1253', 'Greek_CI_AS', false],
  ['CP1254', 'Turkish_CI_AS', false],
  ['CP1255', 'Hebrew_CI_AS', false],
  ['CP1256', 'Arabic_CI_AS', false],
  ['CP1257', 'Lithuanian_CI_AS', false],
  ['CP1258', 'Vietnamese_CI_AS', false],
  ['CP932', 'Japanese_CI_AS', true],
  ['CP936', 'Chinese_PRC_CI_AS', true],
  ['CP949', 'Korean_Wansung_CI_AS', true],
  ['CP950', 'Chinese_Taiwan_Stroke_CI_AS', true]
];

const DATABASE = '__tedious_codepages';

// Best fits that newer versions of Windows (such as Windows Server 2022) have
// for the single-byte code pages, and that SQL Server uses when it runs on
// them or on Linux. SQL Server on older versions of Windows (such as the one
// AppVeyor's Visual Studio 2022 image runs) encodes these characters as "?",
// as do Microsoft's published tables. tedious encodes them as the newer versions
// do; this is the only difference between SQL Server versions and hosts.
const NEWER_WINDOWS_BEST_FITS = new Set([
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A,
  0x2010, 0x2011, 0x2012, 0x2015, 0x201A, 0x201B, 0x201E, 0x201F, 0x2024, 0x202F,
  0x2032, 0x2033, 0x2035, 0x2036, 0x2044, 0x20A4, 0x2236
]);

function hex(text: string) {
  return Array.from(text, (c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

// Checks that `varchar` values are decoded as SQL Server itself converts them
// to `nvarchar`, for every single byte and, in the double-byte code pages,
// every two-byte sequence starting with a byte from 0x80 to 0xFF. And that
// `varchar` values are encoded as SQL Server converts `nvarchar` values to
// `varchar`, for every UTF-16 code unit.
describe('`varchar` values in each code page', function() {
  this.timeout(60000);

  let connection: Connection;
  let originalDatabaseName: string;

  function execSql(sql: string, configure?: (request: Request) => void): Promise<unknown[][]> {
    return new Promise((resolve, reject) => {
      const rows: unknown[][] = [];
      const request = new Request(sql, (err) => (err ? reject(err) : resolve(rows)));
      configure?.(request);
      request.on('row', (columns) => rows.push(columns.map((column: { value: unknown }) => column.value)));
      connection.execSql(request);
    });
  }

  function execSqlBatch(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.execSqlBatch(new Request(sql, (err) => (err ? reject(err) : resolve())));
    });
  }

  before(function() {
    // Creating new databases on Azure SQL is a bit of a headache.
    if (/\w+\.database\.windows\.net/.test(getConfig().server)) {
      this.skip();
    }
  });

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    connection.once('databaseChange', (databaseName) => {
      originalDatabaseName = databaseName;
    });
    connection.connect(done);
  });

  afterEach(async function() {
    if (connection.closed) {
      return;
    }

    await execSqlBatch('USE ' + originalDatabaseName);
    await execSqlBatch(`DROP DATABASE IF EXISTS ${DATABASE}`);

    await new Promise<void>((resolve) => {
      connection.on('end', () => resolve());
      connection.close();
    });
  });

  async function useDatabaseWithCollation(collation: string) {
    await execSqlBatch(`DROP DATABASE IF EXISTS ${DATABASE}`);
    await execSqlBatch(`CREATE DATABASE ${DATABASE} COLLATE ${collation}`);
    await execSqlBatch(`USE ${DATABASE}`);
  }

  for (const [codepage, collation, doubleByte] of COLLATIONS) {
    it(`decodes ${codepage} (${collation}) as SQL Server does`, async function() {
      await useDatabaseWithCollation(collation);

      // In a database with this collation, a `varchar` cast from binary has
      // the binary's bytes, in this collation's code page. SQL Server drops a
      // lead byte without a trail byte, so the bytes it sends are selected too.
      const singleBytes = `
        SELECT TOP (256) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS v FROM sys.all_columns
      `;
      const doubleBytes = `
        SELECT TOP (32768) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) + 32767 AS v FROM sys.all_columns a CROSS JOIN sys.all_columns b
      `;

      const rows = await execSql(`
        SELECT CAST(CAST(CAST(v AS binary(1)) AS varchar(1)) AS varbinary(1)), CAST(CAST(v AS binary(1)) AS varchar(1)), CAST(CAST(CAST(v AS binary(1)) AS varchar(1)) AS nvarchar(2))
        FROM (${singleBytes}) AS n
        ${doubleByte ? `
          UNION ALL
          SELECT CAST(CAST(CAST(v AS binary(2)) AS varchar(2)) AS varbinary(2)), CAST(CAST(v AS binary(2)) AS varchar(2)), CAST(CAST(CAST(v AS binary(2)) AS varchar(2)) AS nvarchar(4))
          FROM (${doubleBytes}) AS n
        ` : ''}
      `);

      assert.strictEqual(rows.length, doubleByte ? 256 + 32768 : 256);

      const differences = [];
      for (const [bytes, decoded, converted] of rows as Array<[Buffer, string, string]>) {
        if (decoded !== converted) {
          differences.push(`${bytes.toString('hex')}: decoded ${hex(decoded)}, SQL Server ${hex(converted)}`);
        }
      }
      assert.deepEqual(differences.slice(0, 20), [], `${differences.length} byte sequences are decoded differently`);
    });
  }

  it('decodes UTF-8, including invalid sequences, as SQL Server does', async function() {
    const [[version]] = await execSql('SELECT CAST(SERVERPROPERTY(\'ProductMajorVersion\') AS int)');
    if ((version as number) < 15) {
      // UTF-8 collations were added in SQL Server 2019.
      this.skip();
    }

    await useDatabaseWithCollation('Latin1_General_100_CI_AS_SC_UTF8');

    // Valid text, and the invalid sequences SQL Server stores in a UTF-8
    // `varchar` (it rejects other invalid sequences): overlong forms,
    // surrogates and code points above U+10FFFF.
    const values = [
      '616263', 'c3a9e282acf09f9880', 'efbbbf61', 'f48fbfbf', 'efbfbf',
      'e08080', 'e09f80', 'f0808080', 'f08f8080', 'eda080', 'edbfbf', 'eda080edb080', 'eda061',
      'f4908080', 'f4908061', 'f4bfbfbf'
    ];

    const rows = await execSql(`
      SELECT CAST(v AS varbinary(20)), v, CAST(v AS nvarchar(20))
      FROM (VALUES ${values.map((value) => `(CAST(0x${value} AS varchar(20)))`).join(', ')}) AS n (v)
    `);

    const differences = [];
    for (const [bytes, decoded, converted] of rows as Array<[Buffer, string, string]>) {
      if (decoded !== converted) {
        differences.push(`${bytes.toString('hex')}: decoded ${hex(decoded)}, SQL Server ${hex(converted)}`);
      }
    }
    assert.strictEqual(rows.length, values.length);
    assert.deepEqual(differences, []);
  });

  for (const [codepage, collation, doubleByte] of COLLATIONS) {
    it(`encodes ${codepage} (${collation}) as SQL Server does`, async function() {
      await useDatabaseWithCollation(collation);

      // Every character on its own, as SQL Server converts it.
      const rows = await execSql(`
        SELECT v, CAST(CAST(NCHAR(v) AS varchar(4)) AS varbinary(4))
        FROM (SELECT TOP (65536) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS v FROM sys.all_columns a CROSS JOIN sys.all_columns b) AS n
      `);
      assert.strictEqual(rows.length, 65536);

      const differences = [];
      const olderWindows = new Set<number>();
      for (const [v, converted] of rows as Array<[number | string, Buffer]>) {
        const unit = Number(v);
        const char = String.fromCharCode(unit);
        const encoded = encode(char, codepage);
        if (encoded.equals(converted)) {
          continue;
        }

        if (!doubleByte && NEWER_WINDOWS_BEST_FITS.has(unit) && converted.equals(Buffer.from('?'))) {
          olderWindows.add(unit);
          continue;
        }

        differences.push(`${hex(char)}: encoded ${encoded.toString('hex')}, SQL Server ${converted.toString('hex')}`);
      }
      assert.deepEqual(differences.slice(0, 20), [], `${differences.length} characters are encoded differently`);

      // All of them in one value (but for those SQL Server encodes as "?" on
      // older versions of Windows), with a surrogate pair and unpaired
      // surrogates, sent as a parameter and as a streamed parameter.
      let value = '';
      for (let char = 0; char <= 0xFFFF; char++) {
        if (!olderWindows.has(char)) {
          value += String.fromCharCode(char);
        }
      }
      value += 'a\u{1F600}b\uD83Dc\uDE00';

      // TDS 7.1 has no `varchar(max)`, so send pieces that fit in
      // `varchar(8000)` (at most two bytes per character), and no streamed
      // parameter, which is always sent as `varchar(max)`.
      if (getConfig().options.tdsVersion === '7_1') {
        for (let i = 0; i < value.length; i += 4000) {
          const piece = value.slice(i, i + 4000);
          const [[sent, expected]] = await execSql(`
            SELECT CAST(@value AS varbinary(8000)), CAST(CAST(@unicode AS varchar(8000)) AS varbinary(8000))
          `, (request) => {
            request.addParameter('value', TYPES.VarChar, piece);
            request.addParameter('unicode', TYPES.NVarChar, piece);
          }) as Array<[Buffer, Buffer]>;

          assert.isTrue(sent.equals(expected), `parameter with characters ${i} to ${i + piece.length - 1}`);
        }
        return;
      }

      async function * chunks() {
        for (let i = 0; i < value.length; i += 1000) {
          yield value.slice(i, i + 1000);
        }
      }

      const [[sent, streamed, expected]] = await execSql(`
        SELECT CAST(@value AS varbinary(max)), CAST(@streamed AS varbinary(max)), CAST(CAST(@unicode AS varchar(max)) AS varbinary(max))
      `, (request) => {
        request.addParameter('value', TYPES.VarChar, value);
        request.addParameter('streamed', TYPES.VarChar, chunks());
        request.addParameter('unicode', TYPES.NVarChar, value);
      }) as Array<[Buffer, Buffer, Buffer]>;

      assert.isTrue(sent.equals(expected), 'parameter');
      assert.isTrue(streamed.equals(expected), 'streamed parameter');
    });
  }
});
