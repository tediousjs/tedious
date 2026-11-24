// What `test/integration/codepage-test.ts` and
// `scripts/record-sqlserver-encodings.js` both use to compare tedious' code
// page conversions with SQL Server's.

'use strict';

/**
 * A collation for each legacy code page, and whether it is a double-byte code
 * page.
 *
 * @type {ReadonlyArray<readonly [codepage: import('../src/collation').Encoding, collation: string, doubleByte: boolean]>}
 */
const COLLATIONS = [
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

/**
 * Selects every UTF-16 code unit, from 0 to 0xFFFF, and the bytes SQL Server
 * converts it to as `varchar`, in the current database's collation.
 */
const SQL_SERVER_ENCODINGS_QUERY = `
  SELECT v, CAST(CAST(NCHAR(v) AS varchar(4)) AS varbinary(4))
  FROM (SELECT TOP (65536) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS v FROM sys.all_columns a CROSS JOIN sys.all_columns b) AS n
`;

/**
 * Quotes a name for use in SQL, as `QUOTENAME` does.
 *
 * @param {string} name
 */
function quoteName(name) {
  return '[' + name.replace(/]/g, ']]') + ']';
}

module.exports = { COLLATIONS, SQL_SERVER_ENCODINGS_QUERY, quoteName };
