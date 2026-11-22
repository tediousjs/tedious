import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
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

const DATABASE = '__tedious_codepage_decoding';

function hex(text: string) {
  return Array.from(text, (c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

// Checks that `varchar` values are decoded as SQL Server itself converts them
// to `nvarchar`, for every single byte and, in the double-byte code pages,
// every two-byte sequence starting with a byte from 0x80 to 0xFF.
describe('Decoding `varchar` values in each code page', function() {
  this.timeout(60000);

  let connection: Connection;
  let originalDatabaseName: string;

  function execSql(sql: string): Promise<unknown[][]> {
    return new Promise((resolve, reject) => {
      const rows: unknown[][] = [];
      const request = new Request(sql, (err) => (err ? reject(err) : resolve(rows)));
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

  for (const [codepage, collation, doubleByte] of COLLATIONS) {
    it(`decodes ${codepage} (${collation}) as SQL Server does`, async function() {
      await execSqlBatch(`DROP DATABASE IF EXISTS ${DATABASE}`);
      await execSqlBatch(`CREATE DATABASE ${DATABASE} COLLATE ${collation}`);
      await execSqlBatch(`USE ${DATABASE}`);

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

      let invalid = 0;
      for (const [bytes, decoded, converted] of rows as Array<[Buffer, string, string]>) {
        if (decoded === converted) {
          continue;
        }

        // Where SQL Server converts an invalid sequence to its default
        // character, tedious decodes it to U+FFFD.
        const description = `${bytes.toString('hex')}: decoded ${hex(decoded)}, SQL Server ${hex(converted)}`;
        assert.isTrue(doubleByte, description);
        assert.include(decoded, '�', description);
        assert.match(converted, codepage === 'CP932' ? /・/ : /\?/, description);
        invalid++;
      }

      if (!doubleByte) {
        assert.strictEqual(invalid, 0);
      }
    });
  }
});
