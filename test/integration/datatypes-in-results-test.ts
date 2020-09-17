import fs from 'fs';
import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { typeByName as TYPES } from '../../src/data-type';

const debug = false;

const config = JSON.parse(
  fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
).config;
config.options.textsize = 8 * 1024;

if (debug) {
  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true,
  };
} else {
  config.options.debug = {};
}

config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

describe('Datatypes in results test', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(config);

    connection.on('errorMessage', function(error) {
      console.log(`${error.number} : ${error.message}`);
    });

    connection.on('debug', function(message) {
      if (debug) {
        console.log(message);
      }
    });

    connection.connect(done);
  });

  afterEach(function(done) {
    if (!connection.closed) {
      connection.on('end', done);
      connection.close();
    } else {
      done();
    }
  });

  function testDataType(expectedType: typeof TYPES[keyof typeof TYPES], cases: { [key: string]: [string, any] | [string, any, string] }) {
    describe(expectedType.name, function() {
      for (const description in cases) {
        if (!cases.hasOwnProperty(description)) {
          continue;
        }

        const [sql, expectedValue, tdsVersion] = cases[description];

        if (tdsVersion && tdsVersion > config.options.tdsVersion) {
          it.skip(description);
          continue;
        }

        it(description, function(done) {
          let rowProcessed = 0;
          const request = new Request(sql, done);

          request.on('row', function(columns) {
            const expectedRowVal = (expectedValue instanceof Array) ? expectedValue[rowProcessed++] : expectedValue;
            if (expectedRowVal instanceof Date) {
              assert.strictEqual(columns[0].value.getTime(), expectedRowVal.getTime());
            } else if (
              expectedRowVal instanceof Array ||
              expectedRowVal instanceof Buffer
            ) {
              assert.deepEqual(columns[0].value, expectedRowVal);
            } else {
              assert.strictEqual(columns[0].value, expectedRowVal);
            }
          });

          connection.execSqlBatch(request);
        });
      }
    });
  }

  testDataType(TYPES.TinyInt, {
    'should handle small value': ['select cast(8 as tinyint)', 8],
    'should handle large value': ['select cast(252 as tinyint)', 252],
    'should handle null value': ['select cast(null as tinyint)', null]
  });

  testDataType(TYPES.SmallInt, {
    'should test small value': ['select cast(8 as smallint)', 8],
    'should test negative value': ['select cast(-8 as smallint)', -8],
    'should test large value': ['select cast(1443 as smallint)', 1443],
    'should test null value': ['select cast(null as smallint)', null]
  });

  testDataType(TYPES.Int, {
    'should test int': ['select cast(8 as int)', 8],
    'should test int null': ['select cast(null as int)', null]
  });

  testDataType(TYPES.Real, {
    'should test real': ['select cast(9.5 as real)', 9.5],
    'should test real null': ['select cast(null as real)', null]
  });

  testDataType(TYPES.Float, {
    'should test float': ['select cast(9.5 as float)', 9.5],
    'should test float null': ['select cast(null as float)', null]
  });

  testDataType(TYPES.BigInt, {
    'should test big int': ['select cast(8 as bigint)', '8'],
    'should test negative big int': ['select cast(-8 as bigint)', '-8'],
    'should test big int null': ['select cast(null as bigint)', null],
  });

  testDataType(TYPES.Bit, {
    'should test bit false': ["select cast('false' as bit)", false],
    'should test bit true': ["select cast('true' as bit)", true],
    'should test bit null': ['select cast(null as bit)', null]
  });

  testDataType(TYPES.DateTime, {
    'should test date time': [
      "select cast('2011-12-4 10:04:23' as datetime)",
      new Date('December 4, 2011 10:04:23 GMT')
    ],

    'should test date time null': ['select cast(null as datetime)', null],

    // The tests below validates DateTime precision as described in the section
    // "Rounding of datetime Fractional Second Precision" from
    // https://msdn.microsoft.com/en-us/library/ms187819.aspx
    'should test date time precision_0': [
      "select cast('1998-1-1 23:59:59.990' as datetime)",
      new Date('January 1, 1998 23:59:59.990 GMT')
    ],

    'should test date time precision_1': [
      "select cast('1998-1-1 23:59:59.991' as datetime)",
      new Date('January 1, 1998 23:59:59.990 GMT')
    ],

    'should test date time precision_2': [
      "select cast('1998-1-1 23:59:59.992' as datetime)",
      new Date('January 1, 1998 23:59:59.993 GMT')
    ],

    'should test date time precision_3': [
      "select cast('1998-1-1 23:59:59.993' as datetime)",
      new Date('January 1, 1998 23:59:59.993 GMT')
    ],

    'should test date time precision_4': [
      "select cast('1998-1-1 23:59:59.994' as datetime)",
      new Date('January 1, 1998 23:59:59.993 GMT')
    ],

    'should test date time precision_5': [
      "select cast('1998-1-1 23:59:59.995' as datetime)",
      new Date('January 1, 1998 23:59:59.997 GMT')
    ],

    'should test date time precision_6': [
      "select cast('1998-1-1 23:59:59.996' as datetime)",
      new Date('January 1, 1998 23:59:59.997 GMT')
    ],

    'should test date time precision_7': [
      "select cast('1998-1-1 23:59:59.997' as datetime)",
      new Date('January 1, 1998 23:59:59.997 GMT')
    ],

    'should test date time precision_8': [
      "select cast('1998-1-1 23:59:59.998' as datetime)",
      new Date('January 1, 1998 23:59:59.997 GMT')
    ],

    'should test date time precision_9': [
      "select cast('1998-1-1 23:59:59.999' as datetime)",
      new Date('January 2, 1998 00:00:00.000 GMT')
    ]
  });

  testDataType(TYPES.SmallDateTime, {
    'should test small date time': [
      "select cast('2011-12-4 10:04:23' as smalldatetime)",
      new Date('December 4, 2011 10:04:00 GMT')
    ],

    'should test small date time null': [
      'select cast(null as smalldatetime)', null
    ]
  });

  testDataType(TYPES.DateTime2, {
    'should test datetime2': [
      "select cast('2011-12-4 10:04:23' as datetime2)",
      new Date('December 4, 2011 10:04:23 +00'),
      '7_3_A'
    ],

    'should test datetime2 null': [
      'select cast(null as datetime2)', null, '7_3_A'
    ]
  });

  testDataType(TYPES.Time, {
    'should test time': [
      "select cast('10:04:23' as time)",
      new Date(Date.UTC(1970, 0, 1, 10, 4, 23)),
      '7_3_A'
    ],

    'should test time null': [
      'select cast(null as time)', null, '7_3_A'
    ]
  });

  testDataType(TYPES.Date, {
    'should test date': [
      "select cast('2014-03-08' as date)",
      new Date(Date.UTC(2014, 2, 8)),
      '7_3_A'
    ],

    'should test date null': [
      'select cast(null as date)', null, '7_3_A'
    ]
  });

  testDataType(TYPES.DateTimeOffset, {
    'should test datetimeoffset': [
      "select cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset)",
      new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)),
      '7_3_A'
    ],

    'should test datetimeoffset null': [
      'select cast(null as datetimeoffset)', null
    ]
  });

  testDataType(TYPES.Numeric, {
    'should test numeric small value': [
      'select cast(9.3 as numeric(3,2))', 9.3
    ],

    'should test numeric large value': [
      'select cast(9876543.3456 as numeric(12,5))', 9876543.3456
    ],

    'should test numeric very large value': [
      'select cast(9876543219876543.3456 as numeric(25,5))',
      9876543219876543.3456
    ],

    'should test numeric extremely large value': [
      'select cast(98765432198765432198765432.3456 as numeric(35,5))',
      98765432198765432198765432.3456
    ],

    'should test numeric null': [
      'select cast(null as numeric(3,2))', null
    ]
  });

  testDataType(TYPES.SmallMoney, {
    'should test small money': ['select cast(1.22229 as smallmoney)', 1.2223],
    'should test small money negative': ['select cast(-1.22229 as smallmoney)', -1.2223],
    'should test small money null': ['select cast(null as smallmoney)', null]
  });

  testDataType(TYPES.Money, {
    'should test money': [
      'select cast(1.22229 as money)',
      1.2223
    ],

    'should test money negative': [
      'select cast(-1.22229 as money)',
      -1.2223
    ],

    'should test money large': [
      'select cast(123456789012345.11 as money)',
      123456789012345.11
    ],

    'should test money large negative': [
      'select cast(-123456789012345.11 as money)',
      -123456789012345.11
    ],

    'should test money null': [
      'select cast(null as money)',
      null
    ]
  });

  testDataType(TYPES.VarChar, {
    'should test varchar': ["select cast('abcde' as varchar(10))", 'abcde'],
    'should test varchar empty': ["select cast('' as varchar(10))", ''],
    'should test varchar null': ['select cast(null as varchar(10))', null],

    // The codepage used is WINDOWS-1251.
    'should test varchar collation': [
      `create table #tab1 (col1 nvarchar(10) collate Cyrillic_General_CS_AS);
       insert into #tab1 values(N'abcdШ');
       select cast(col1 as varchar(10)) from #tab1`,
      'abcdШ'
    ],

    'should test varchar(max)': [
      "select cast('abc' as varchar(max))",
      'abc',
      '7_2'
    ],

    'should test varchar(max) null': [
      'select cast(null as varchar(max))',
      null,
      '7_2'
    ],

    'should test varchar(max) long as text size': [
      `select cast('${'x'.repeat(config.options.textsize)}' as varchar(max))`,
      'x'.repeat(config.options.textsize),
      '7_2'
    ],

    'should test varchar(max) larger than text size': [
      `select cast('${'x'.repeat(config.options.textsize + 10)}' as varchar(max))`,
      'x'.repeat(config.options.textsize),
      '7_2'
    ]
  });

  testDataType(TYPES.NVarChar, {
    'should test nvarchar': [
      "select cast('abc' as nvarchar(10))",
      'abc'
    ],

    'should test nvarchar null': [
      'select cast(null as nvarchar(10))',
      null
    ],

    'should test nvarchar(max)': [
      "select cast('abc' as nvarchar(max))", 'abc', '7_2'
    ],

    'should test nvarchar(max) null': [
      'select cast(null as nvarchar(max))', null, '7_2'
    ]
  });

  testDataType(TYPES.VarBinary, {
    'should test varbinary': [
      'select cast(0x1234 as varbinary(4))',
      Buffer.from([0x12, 0x34])
    ],

    'should test varbinary null': [
      'select cast(null as varbinary(10))', null
    ],

    'should test varbinary(max)': [
      'select cast(0x1234 as varbinary(max))',
      Buffer.from([0x12, 0x34]),
      '7_2'
    ],

    'should test varbinary(max) null': [
      'select cast(null as varbinary(max))', null, '7_2'
    ]
  });

  testDataType(TYPES.Binary, {
    'should test binary': [
      'select cast(0x1234 as binary(4))',
      Buffer.from([0x12, 0x34, 0x00, 0x00])
    ],

    'should test binary null': [
      'select cast(null as binary(10))', null
    ]
  });

  testDataType(TYPES.Char, {
    'should test char': [
      "select cast('abc' as char(5))", 'abc  '
    ],

    'should test char null': [
      'select cast(null as char(5))', null
    ]
  });

  testDataType(TYPES.NChar, {
    'should test nchar': [
      "select cast('abc' as nchar(5))", 'abc  '
    ],

    'should test nchar null': [
      'select cast(null as nchar(5))', null
    ]
  });

  testDataType(TYPES.Text, {
    'should test text': [
      "select cast('abc' as text) as text", 'abc'
    ],

    'should test text emtpy': [
      "select cast('' as text) as text", ''
    ],

    'should test text null': [
      'select cast(null as text) as text', null
    ]
  });

  testDataType(TYPES.NText, {
    'should test text': [
      "select cast('abc' as ntext) as text", 'abc'
    ],

    'should test text emtpy': [
      "select cast('' as ntext) as text", ''
    ],

    'should test text null': [
      'select cast(null as ntext) as text', null
    ]
  });

  testDataType(TYPES.Image, {
    'should test image': ['select cast(0x1234 as image)', Buffer.from([0x12, 0x34])],
    'should test image null': ['select cast(null as image)', null]
  });

  testDataType(TYPES.UniqueIdentifier, {
    'should test guid': [
      "select cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier)",
      '01234567-89AB-CDEF-0123-456789ABCDEF'
    ],

    'should test guid null': [
      'select cast(null as uniqueidentifier)', null
    ]
  });

  testDataType(TYPES.Variant, {
    'should test variant int': [
      'select cast(11 as sql_variant)', 11, '7_2'
    ],

    'should test variant numeric': [
      'select cast(11.16 as sql_variant)', 11.16, '7_2'
    ],

    'should test variant varchar': [
      "select cast('abc' as sql_variant)", 'abc', '7_2'
    ],

    'should test variant varbinary': [
      'select cast(cast(0x1234 as varbinary(16)) as sql_variant)',
      Buffer.from([0x12, 0x34]),
      '7_2'
    ],

    'should test variant datetimeoffset': [
      "select cast(cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset) as sql_variant)",
      new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)),
      '7_3_A'
    ],

    'should test variant nvarchar': [
      "select N'abcdШ' as sql_variant",
      'abcdШ'
    ],

    'should test variant decimal': [
      'select cast(cast(3148.29 as decimal(20,8)) as sql_variant)',
      3148.29
    ],

    'should test variant uniqueidentifier': [
      "select cast(cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier) as sql_variant)",
      '01234567-89AB-CDEF-0123-456789ABCDEF'
    ],

    'should test variant datetime': [
      "select cast(cast('2011-12-4 10:04:23' as datetime) as sql_variant)",
      new Date('December 4, 2011 10:04:23 GMT')
    ],

    'should test variant null': [
      'select cast(null as sql_variant)', null, '7_2'
    ]
  });

  testDataType(TYPES.Xml, {
    'should test xml': (() => {
      const xml = '<root><child attr="attr-value"/></root>';
      return [`select cast('${xml}' as xml)`, xml, '7_2'] as [string, string, string];
    })(),

    'should test xml null': [
      'select cast(null as xml)', null, '7_2'
    ],

    'should test xml with schema': (() => {
      // Cannot use temp tables, as schema collections as not available to them.
      // Schema must be created manually in database in order to make this done work properly (sql 2012)

      const xml = '<root/>';

      const schemaName = 'test_tedious_schema';
      const tableName = 'test_tedious_table';

      const schema = `
        <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
          <xsd:element name="root">
          </xsd:element>
        </xsd:schema>
      `;

      const sql = `
        -- Check if we have permissions to create schema collections
        IF HAS_PERMS_BY_NAME(db_name(), 'DATABASE', 'CREATE XML SCHEMA COLLECTION') = 1
        BEGIN
          IF OBJECT_ID('${tableName}', 'U') IS NOT NULL
            DROP TABLE [${tableName}];

          IF EXISTS (SELECT * FROM [sys].[xml_schema_collections] WHERE [name] = '${schemaName}' AND [schema_id] = SCHEMA_ID())
            DROP XML SCHEMA COLLECTION [${schemaName}];

          CREATE XML SCHEMA COLLECTION [${schemaName}] AS N'${schema}';

          EXEC('CREATE TABLE [${tableName}] ([xml] [xml]([${schemaName}]))');

          INSERT INTO [${tableName}] ([xml]) VALUES ('${xml}');

          SELECT [xml] FROM [${tableName}];\
        END
        ELSE
        BEGIN
          SELECT '<root/>'
        END
      `;

      return [sql, xml, '7_2'] as [string, string, string];
    })()
  });

  testDataType(TYPES.UDT, {
    'should test udt': [
      "select geography::STGeomFromText('LINESTRING(-122.360 47.656, -122.343 47.656 )', 4326) as geo",
      Buffer.from([
        230, 16, 0, 0, 1, 20, 135, 22, 217, 206, 247, 211, 71, 64, 215, 163, 112, 61, 10, 151, 94, 192, 135, 22, 217, 206, 247, 211, 71, 64, 203, 161, 69, 182, 243, 149, 94, 192
      ]),
      '7_2'
    ],

    'should test udt null': [
      'select cast(null as geography)', null, '7_2'
    ]
  });
});
