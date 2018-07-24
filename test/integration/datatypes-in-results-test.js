var Connection = require('../../src/connection');
var Request = require('../../src/request');
var fs = require('fs');

var debug = false;

var config = JSON.parse(
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

exports.dbnull = function(test) {
  execSql(test, 'select null', null);
};

exports.tinyint = function(test) {
  execSql(test, 'select cast(8 as tinyint)', 8);
};

exports.tinyintLarge = function(test) {
  execSql(test, 'select cast(252 as tinyint)', 252);
};

exports.tinyintNull = function(test) {
  execSql(test, 'select cast(null as tinyint)', null);
};

exports.smallint = function(test) {
  execSql(test, 'select cast(8 as smallint)', 8);
};

exports.smallintNull = function(test) {
  execSql(test, 'select cast(null as smallint)', null);
};

exports.int = function(test) {
  execSql(test, 'select cast(8 as int)', 8);
};

exports.intNull = function(test) {
  execSql(test, 'select cast(null as int)', null);
};

exports.real = function(test) {
  execSql(test, 'select cast(9.5 as real)', 9.5);
};

exports.realNull = function(test) {
  execSql(test, 'select cast(null as real)', null);
};

exports.float = function(test) {
  execSql(test, 'select cast(9.5 as float)', 9.5);
};

exports.floatNull = function(test) {
  execSql(test, 'select cast(null as float)', null);
};

exports.bigint = function(test) {
  execSql(test, 'select cast(8 as bigint)', '8');
};

exports.bigintNull = function(test) {
  execSql(test, 'select cast(null as bigint)', null);
};

exports.bitFalse = function(test) {
  execSql(test, "select cast('false' as bit)", false);
};

exports.bitTrue = function(test) {
  execSql(test, "select cast('true' as bit)", true);
};

exports.bitNull = function(test) {
  execSql(test, 'select cast(null as bit)', null);
};

exports.datetime = function(test) {
  execSql(
    test,
    "select cast('2011-12-4 10:04:23' as datetime)",
    new Date('December 4, 2011 10:04:23 GMT')
  );
};

exports.datetimeNull = function(test) {
  execSql(test, 'select cast(null as datetime)', null);
};

// The tests below validates DateTime precision as described in the section
// "Rounding of datetime Fractional Second Precision" from
// https://msdn.microsoft.com/en-us/library/ms187819.aspx

exports.dateTimePrecision_0 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.990' as datetime)",
    new Date('January 1, 1998 23:59:59.990 GMT')
  );
};

exports.dateTimePrecision_1 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.991' as datetime)",
    new Date('January 1, 1998 23:59:59.990 GMT')
  );
};

exports.dateTimePrecision_2 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.992' as datetime)",
    new Date('January 1, 1998 23:59:59.993 GMT')
  );
};

exports.dateTimePrecision_3 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.993' as datetime)",
    new Date('January 1, 1998 23:59:59.993 GMT')
  );
};

exports.dateTimePrecision_4 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.994' as datetime)",
    new Date('January 1, 1998 23:59:59.993 GMT')
  );
};

exports.dateTimePrecision_5 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.995' as datetime)",
    new Date('January 1, 1998 23:59:59.997 GMT')
  );
};

exports.dateTimePrecision_6 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.996' as datetime)",
    new Date('January 1, 1998 23:59:59.997 GMT')
  );
};

exports.dateTimePrecision_7 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.997' as datetime)",
    new Date('January 1, 1998 23:59:59.997 GMT')
  );
};

exports.dateTimePrecision_8 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.998' as datetime)",
    new Date('January 1, 1998 23:59:59.997 GMT')
  );
};

exports.dateTimePrecision_9 = function(test) {
  execSql(
    test,
    "select cast('1998-1-1 23:59:59.999' as datetime)",
    new Date('January 2, 1998 00:00:00.000 GMT')
  );
};

exports.smallDatetime = function(test) {
  execSql(
    test,
    "select cast('2011-12-4 10:04:23' as smalldatetime)",
    new Date('December 4, 2011 10:04:00 GMT')
  );
};

exports.smallDatetimeNull = function(test) {
  execSql(test, 'select cast(null as smalldatetime)', null);
};

exports.datetime2 = function(test) {
  execSql(
    test,
    "select cast('2011-12-4 10:04:23' as datetime2)",
    new Date('December 4, 2011 10:04:23 +00'),
    '7_3_A'
  );
};

exports.datetime2Null = function(test) {
  execSql(test, 'select cast(null as datetime2)', null, '7_3_A');
};

exports.time = function(test) {
  execSql(
    test,
    "select cast('10:04:23' as time)",
    new Date(Date.UTC(1970, 0, 1, 10, 4, 23)),
    '7_3_A'
  );
};

exports.timeNull = function(test) {
  execSql(test, 'select cast(null as time)', null, '7_3_A');
};

exports.date = function(test) {
  execSql(
    test,
    "select cast('2014-03-08' as date)",
    new Date(Date.UTC(2014, 2, 8)),
    '7_3_A'
  );
};

exports.dateNull = function(test) {
  execSql(test, 'select cast(null as date)', null, '7_3_A');
};

exports.dateTimeOffset = function(test) {
  execSql(
    test,
    "select cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset)",
    new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)),
    '7_3_A'
  );
};

exports.dateTimeOffsetNull = function(test) {
  execSql(test, 'select cast(null as datetimeoffset)', null);
};

exports.numericSmallValue = function(test) {
  execSql(test, 'select cast(9.3 as numeric(3,2))', 9.3);
};

exports.numericLargeValue = function(test) {
  execSql(test, 'select cast(9876543.3456 as numeric(12,5))', 9876543.3456);
};

exports.numericVeryLargeValue = function(test) {
  execSql(
    test,
    'select cast(9876543219876543.3456 as numeric(25,5))',
    9876543219876543.3456
  );
};

exports.numericExtremelyLargeValue = function(test) {
  execSql(
    test,
    'select cast(98765432198765432198765432.3456 as numeric(35,5))',
    98765432198765432198765432.3456
  );
};

exports.numericNull = function(test) {
  execSql(test, 'select cast(null as numeric(3,2))', null);
};

exports.smallMoney = function(test) {
  execSql(test, 'select cast(1.22229 as smallmoney)', 1.2223);
};

exports.smallMoneyNegative = function(test) {
  execSql(test, 'select cast(-1.22229 as smallmoney)', -1.2223);
};

exports.smallMoneyNull = function(test) {
  execSql(test, 'select cast(null as smallmoney)', null);
};

exports.money = function(test) {
  execSql(test, 'select cast(1.22229 as money)', 1.2223);
};

exports.moneyNegative = function(test) {
  execSql(test, 'select cast(-1.22229 as money)', -1.2223);
};

exports.moneyLarge = function(test) {
  execSql(test, 'select cast(123456789012345.11 as money)', 123456789012345.11);
};

exports.moneyLargeNegative = function(test) {
  execSql(
    test,
    'select cast(-123456789012345.11 as money)',
    -123456789012345.11
  );
};

exports.moneyNull = function(test) {
  execSql(test, 'select cast(null as money)', null);
};

exports.varchar = function(test) {
  execSql(test, "select cast('abcde' as varchar(10))", 'abcde');
};

exports.varcharEmpty = function(test) {
  execSql(test, "select cast('' as varchar(10))", '');
};

exports.varcharNull = function(test) {
  execSql(test, 'select cast(null as varchar(10))', null);
};

exports.varcharCollation = function(test) {
  // The codepage used is WINDOWS-1251.
  var sql = `\
create table #tab1 (col1 nvarchar(10) collate Cyrillic_General_CS_AS);
insert into #tab1 values(N'abcdШ');
select cast(col1 as varchar(10)) from #tab1\
`;
  execSql(test, sql, 'abcdШ');
};

exports.varcharMax = function(test) {
  execSql(test, "select cast('abc' as varchar(max))", 'abc', '7_2');
};

exports.varcharMaxNull = function(test) {
  execSql(test, 'select cast(null as varchar(max))', null, '7_2');
};

exports.varcharMaxLongAsTextSize = function(test) {
  var longString = '';
  for (
    var i = 1, end = config.options.textsize, asc = 1 <= end;
    asc ? i <= end : i >= end;
    asc ? i++ : i--
  ) {
    longString += 'x';
  }

  execSql(
    test,
    `select cast('${longString}' as varchar(max))`,
    longString,
    '7_2'
  );
};

exports.varcharMaxLargerThanTextSize = function(test) {
  var longString = '';
  for (
    var i = 1, end = config.options.textsize + 10, asc = 1 <= end;
    asc ? i <= end : i >= end;
    asc ? i++ : i--
  ) {
    longString += 'x';
  }

  execSql(
    test,
    `select cast('${longString}' as varchar(max))`,
    longString.slice(0, config.options.textsize),
    '7_2'
  );
};

exports.nvarchar = function(test) {
  execSql(test, "select cast('abc' as nvarchar(10))", 'abc');
};

exports.nvarcharNull = function(test) {
  execSql(test, 'select cast(null as nvarchar(10))', null);
};

exports.nvarcharMax = function(test) {
  execSql(test, "select cast('abc' as nvarchar(max))", 'abc', '7_2');
};

exports.nvarcharMaxNull = function(test) {
  execSql(test, 'select cast(null as nvarchar(max))', null, '7_2');
};

exports.varbinary = function(test) {
  execSql(
    test,
    'select cast(0x1234 as varbinary(4))',
    new Buffer([0x12, 0x34])
  );
};

exports.varbinaryNull = function(test) {
  execSql(test, 'select cast(null as varbinary(10))', null);
};

exports.binary = function(test) {
  execSql(
    test,
    'select cast(0x1234 as binary(4))',
    new Buffer([0x12, 0x34, 0x00, 0x00])
  );
};

exports.binaryNull = function(test) {
  execSql(test, 'select cast(null as binary(10))', null);
};

exports.varbinaryMax = function(test) {
  execSql(
    test,
    'select cast(0x1234 as varbinary(max))',
    new Buffer([0x12, 0x34]),
    '7_2'
  );
};

exports.varbinaryMaxNull = function(test) {
  execSql(test, 'select cast(null as varbinary(max))', null, '7_2');
};

exports.char = function(test) {
  execSql(test, "select cast('abc' as char(5))", 'abc  ');
};

exports.charNull = function(test) {
  execSql(test, 'select cast(null as char(5))', null);
};

exports.nchar = function(test) {
  execSql(test, "select cast('abc' as nchar(5))", 'abc  ');
};

exports.ncharNull = function(test) {
  execSql(test, 'select cast(null as nchar(5))', null);
};

exports.text = function(test) {
  execSql(test, "select cast('abc' as text) as text", 'abc');
};

exports.textEmpty = function(test) {
  execSql(test, "select cast('' as text) as text", '');
};

exports.textNull = function(test) {
  execSql(test, 'select cast(null as text) as text', null);
};

exports.ntext = function(test) {
  execSql(test, "select cast('abc' as ntext) as text", 'abc');
};

exports.ntextEmpty = function(test) {
  execSql(test, "select cast('' as ntext) as text", '');
};

exports.ntextNull = function(test) {
  execSql(test, 'select cast(null as ntext) as text', null);
};

exports.image = function(test) {
  execSql(test, 'select cast(0x1234 as image)', new Buffer([0x12, 0x34]));
};

exports.imageNull = function(test) {
  execSql(test, 'select cast(null as image)', null);
};

exports.guid = function(test) {
  execSql(
    test,
    "select cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier)",
    '01234567-89AB-CDEF-0123-456789ABCDEF'
  );
};

exports.guidNull = function(test) {
  execSql(test, 'select cast(null as uniqueidentifier)', null);
};

exports.variantInt = function(test) {
  execSql(test, 'select cast(11 as sql_variant)', 11, '7_2');
};

exports.variantNumeric = function(test) {
  execSql(test, 'select cast(11.16 as sql_variant)', 11.16, '7_2');
};

exports.variantVarChar = function(test) {
  execSql(test, "select cast('abc' as sql_variant)", 'abc', '7_2');
};

exports.variantVarChar2 = function(test) {
  execSql(test, "select SERVERPROPERTY('LicenseType') as LicenseType", 'DISABLED', '7_2');
};

exports.variantVarBin = function(test) {
  execSql(
    test,
    'select cast(0x1234 as sql_variant)',
    new Buffer([0x12, 0x34], '7_2')
  );
};

exports.variantDateTimeOffset = function(test) {
  execSql(
    test,
    "select cast(cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset) as sql_variant)",
    new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)),
    '7_3_A'
  );
};


exports.variantMultipleDatatypes = function(test) {
  const sql = `\
  create table #tab1 (
  [c0] [int] IDENTITY(1,1),
  [c1] [sql_variant] NULL);
  insert into #tab1 ([c1]) values (N'abcdШ');
  insert into #tab1 ([c1]) select cast(3148.29 as decimal(20,8));	
  insert into #tab1 ([c1]) select cast(0x1234 as varbinary(16));
  insert into #tab1 ([c1]) select cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier); 
  insert into #tab1 ([c1]) values (0.00000090000000000);	--decimal(38,17);
  insert into #tab1 ([c1]) select cast('2011-12-4 10:04:23' as datetime);
  insert into #tab1 ([c1]) select cast('abcde' as varchar(10));
  select [c1] from #tab1 ORDER BY [c0];
  `;
  const expectedValues = ['abcdШ',
    3148.29,
    new Buffer([0x12, 0x34]),
    '01234567-89AB-CDEF-0123-456789ABCDEF',
    0.00000090000000000,
    new Date('December 4, 2011 10:04:23 GMT'),
    'abcde'];
  execSql(test, sql, expectedValues);
};

exports.variantNull = function(test) {
  execSql(test, 'select cast(null as sql_variant)', null, '7_2');
};

exports.xml = function(test) {
  var xml = '<root><child attr="attr-value"/></root>';
  execSql(test, `select cast('${xml}' as xml)`, xml, '7_2');
};

exports.xmlNull = function(test) {
  execSql(test, 'select cast(null as xml)', null, '7_2');
};

exports.xmlWithSchema = function(test) {
  // Cannot use temp tables, as schema collections as not available to them.
  // Schema must be created manually in database in order to make this test work properly (sql 2012)

  var xml = '<root/>';

  var schemaName = 'test_tedious_schema';
  var tableName = 'test_tedious_table';

  var schema = `\
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <xsd:element name="root">
  </xsd:element>
</xsd:schema>`;

  var sql = `\
IF OBJECT_ID('${tableName}', 'U') IS NOT NULL
  DROP TABLE [${tableName}];

IF EXISTS (SELECT * FROM [sys].[xml_schema_collections] WHERE [name] = '${schemaName}' AND [schema_id] = SCHEMA_ID())
  DROP XML SCHEMA COLLECTION [${schemaName}];

CREATE XML SCHEMA COLLECTION [${schemaName}] AS N'${schema}';

EXEC('CREATE TABLE [${tableName}] ([xml] [xml]([${schemaName}]))');

INSERT INTO [${tableName}] ([xml]) VALUES ('${xml}');

SELECT [xml] FROM [${tableName}];\
`;

  execSql(test, sql, xml, '7_2');
};

exports.udt = function(test) {
  execSql(
    test,
    "select geography::STGeomFromText('LINESTRING(-122.360 47.656, -122.343 47.656 )', 4326) as geo",
    new Buffer([
      230,
      16,
      0,
      0,
      1,
      20,
      135,
      22,
      217,
      206,
      247,
      211,
      71,
      64,
      215,
      163,
      112,
      61,
      10,
      151,
      94,
      192,
      135,
      22,
      217,
      206,
      247,
      211,
      71,
      64,
      203,
      161,
      69,
      182,
      243,
      149,
      94,
      192,
    ]),
    '7_2'
  );
};

exports.udtNull = function(test) {
  execSql(test, 'select cast(null as geography)', null, '7_2');
};

var execSql = function(test, sql, expectedValue, tdsVersion) {
  if (tdsVersion && tdsVersion > config.options.tdsVersion) {
    test.done();
    return;
  }
  let rowProcessed = 0;
  test.expect(2 + ((expectedValue instanceof Array) ? expectedValue.length : 1));

  var request = new Request(sql, function(err) {
    test.ifError(err);

    connection.close();
  });

  request.on('row', function(columns) {
    const expectedRowVal = (expectedValue instanceof Array) ? expectedValue[rowProcessed++] : expectedValue;
    if (expectedRowVal instanceof Date) {
      test.strictEqual(columns[0].value.getTime(), expectedRowVal.getTime());
    } else if (
      expectedRowVal instanceof Array ||
      expectedRowVal instanceof Buffer
    ) {
      test.deepEqual(columns[0].value, expectedRowVal);
    } else {
      test.strictEqual(columns[0].value, expectedRowVal);
    }
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.execSqlBatch(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('errorMessage', function(error) {
    console.log(`${error.number} : ${error.message}`);
  });

  connection.on('debug', function(message) {
    if (debug) {
      console.log(message);
    }
  });
};
