const Connection = require('../../src/connection');
const Request = require('../../src/request');
const fs = require('fs');
const assert = require('chai').assert;

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

function execSql(done, sql, expectedValue, tdsVersion) {
  if (tdsVersion && tdsVersion > config.options.tdsVersion) {
    done();
    return;
  }
  let rowProcessed = 0;
  const request = new Request(sql, function(err) {
    assert.ifError(err);

    connection.close();
  });

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

  let connection = new Connection(config);

  connection.on('connect', function(err) {
    assert.ifError(err);
    connection.execSqlBatch(request);
  });

  connection.on('end', function(info) {
    done();
  });

  connection.on('errorMessage', function(error) {
    console.log(`${error.number} : ${error.message}`);
  });

  connection.on('debug', function(message) {
    if (debug) {
      console.log(message);
    }
  });
}

describe('Datatypes in results test', function() {
  this.timeout(60000);

  it('should test dbnull', function(done) {
    execSql(done, 'select null', null);
  });

  it('should test tiny int', function(done) {
    execSql(done, 'select cast(8 as tinyint)', 8);
  });

  it('should test tiny int large', function(done) {
    execSql(done, 'select cast(252 as tinyint)', 252);
  });

  it('should test tiny int null', function(done) {
    execSql(done, 'select cast(null as tinyint)', null);
  });

  it('should test small int', function(done) {
    execSql(done, 'select cast(8 as smallint)', 8);
  });

  it('should test small int null', function(done) {
    execSql(done, 'select cast(null as smallint)', null);
  });

  it('should test int', function(done) {
    execSql(done, 'select cast(8 as int)', 8);
  });

  it('should test int null', function(done) {
    execSql(done, 'select cast(null as int)', null);
  });

  it('should test real', function(done) {
    execSql(done, 'select cast(9.5 as real)', 9.5);
  });

  it('should test real null', function(done) {
    execSql(done, 'select cast(null as real)', null);
  });

  it('should test float', function(done) {
    execSql(done, 'select cast(9.5 as float)', 9.5);
  });

  it('should test float null', function(done) {
    execSql(done, 'select cast(null as float)', null);
  });

  it('should test big int', function(done) {
    execSql(done, 'select cast(8 as bigint)', '8');
  });

  it('should test negative big int', function(done) {
    execSql(done, 'select cast(-8 as bigint)', '-8');
  });

  it('should test big int null', function(done) {
    execSql(done, 'select cast(null as bigint)', null);
  });

  it('should test bit false', function(done) {
    execSql(done, "select cast('false' as bit)", false);
  });

  it('should test bit true', function(done) {
    execSql(done, "select cast('true' as bit)", true);
  });

  it('should test bit null', function(done) {
    execSql(done, 'select cast(null as bit)', null);
  });

  it('should test date time', function(done) {
    execSql(
      done,
      "select cast('2011-12-4 10:04:23' as datetime)",
      new Date('December 4, 2011 10:04:23 GMT')
    );
  });

  it('should test date time null', function(done) {
    execSql(done, 'select cast(null as datetime)', null);
  });


  // The tests below validates DateTime precision as described in the section
  // "Rounding of datetime Fractional Second Precision" from
  // https://msdn.microsoft.com/en-us/library/ms187819.aspx
  it('should test date time precision_0', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.990' as datetime)",
      new Date('January 1, 1998 23:59:59.990 GMT')
    );
  });

  it('should test date time precision_1', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.991' as datetime)",
      new Date('January 1, 1998 23:59:59.990 GMT')
    );
  });

  it('should test date time precision_2', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.992' as datetime)",
      new Date('January 1, 1998 23:59:59.993 GMT')
    );
  });

  it('should test date time precision_3', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.993' as datetime)",
      new Date('January 1, 1998 23:59:59.993 GMT')
    );
  });

  it('should test date time precision_4', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.994' as datetime)",
      new Date('January 1, 1998 23:59:59.993 GMT')
    );
  });

  it('should test date time precision_5', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.995' as datetime)",
      new Date('January 1, 1998 23:59:59.997 GMT')
    );
  });


  it('should test date time precision_6', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.996' as datetime)",
      new Date('January 1, 1998 23:59:59.997 GMT')
    );
  });

  it('should test date time precision_7', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.997' as datetime)",
      new Date('January 1, 1998 23:59:59.997 GMT')
    );
  });

  it('should test date time precision_8', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.998' as datetime)",
      new Date('January 1, 1998 23:59:59.997 GMT')
    );
  });

  it('should test date time precision_9', function(done) {
    execSql(
      done,
      "select cast('1998-1-1 23:59:59.999' as datetime)",
      new Date('January 2, 1998 00:00:00.000 GMT')
    );
  });

  it('should test small date time', function(done) {
    execSql(
      done,
      "select cast('2011-12-4 10:04:23' as smalldatetime)",
      new Date('December 4, 2011 10:04:00 GMT')
    );
  });

  it('should test small date time null', function(done) {
    execSql(done, 'select cast(null as smalldatetime)', null);
  });

  it('should test datetime 2', function(done) {
    execSql(
      done,
      "select cast('2011-12-4 10:04:23' as datetime2)",
      new Date('December 4, 2011 10:04:23 +00'),
      '7_3_A'
    );
  });

  it('should test date time 2 null', function(done) {
    execSql(done, 'select cast(null as datetime2)', null, '7_3_A');
  });

  it('should test time', function(done) {
    execSql(
      done,
      "select cast('10:04:23' as time)",
      new Date(Date.UTC(1970, 0, 1, 10, 4, 23)),
      '7_3_A'
    );
  });

  it('should test time null', function(done) {
    execSql(done, 'select cast(null as time)', null, '7_3_A');
  });

  it('should test date', function(done) {
    execSql(
      done,
      "select cast('2014-03-08' as date)",
      new Date(Date.UTC(2014, 2, 8)),
      '7_3_A'
    );
  });

  it('should test date null', function(done) {
    execSql(done, 'select cast(null as date)', null, '7_3_A');
  });

  it('should test date time offset', function(done) {
    execSql(
      done,
      "select cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset)",
      new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)),
      '7_3_A'
    );
  });

  it('should test date time off set null', function(done) {
    execSql(done, 'select cast(null as datetimeoffset)', null);
  });

  it('should test numeric small value', function(done) {
    execSql(done, 'select cast(9.3 as numeric(3,2))', 9.3);
  });


  it('should test numeric large value', function(done) {
    execSql(done, 'select cast(9876543.3456 as numeric(12,5))', 9876543.3456);
  });

  it('should test numeric very large value', function(done) {
    execSql(
      done,
      'select cast(9876543219876543.3456 as numeric(25,5))',
      9876543219876543.3456
    );
  });

  it('should test numeric extremely large value', function(done) {
    execSql(
      done,
      'select cast(98765432198765432198765432.3456 as numeric(35,5))',
      98765432198765432198765432.3456
    );
  });

  it('should test numeric null', function(done) {
    execSql(done, 'select cast(null as numeric(3,2))', null);
  });

  it('should test small money', function(done) {
    execSql(done, 'select cast(1.22229 as smallmoney)', 1.2223);
  });

  it('should test small money negative', function(done) {
    execSql(done, 'select cast(-1.22229 as smallmoney)', -1.2223);
  });

  it('should test small money null', function(done) {
    execSql(done, 'select cast(null as smallmoney)', null);
  });

  it('should test money', function(done) {
    execSql(done, 'select cast(1.22229 as money)', 1.2223);
  });

  it('should test money negative', function(done) {
    execSql(done, 'select cast(-1.22229 as money)', -1.2223);
  });

  it('should test money large', function(done) {
    execSql(done, 'select cast(123456789012345.11 as money)', 123456789012345.11);
  });

  it('should test money large negative', function(done) {
    execSql(
      done,
      'select cast(-123456789012345.11 as money)',
      -123456789012345.11
    );
  });

  it('should test money null', function(done) {
    execSql(done, 'select cast(null as money)', null);
  });

  it('should test varchar', function(done) {
    execSql(done, "select cast('abcde' as varchar(10))", 'abcde');
  });

  it('should test varchar empty', function(done) {
    execSql(done, "select cast('' as varchar(10))", '');
  });

  it('should test varchar null', function(done) {
    execSql(done, 'select cast(null as varchar(10))', null);
  });

  it('should test varchar collation', function(done) {
    // The codepage used is WINDOWS-1251.
    const sql = `\
    create table #tab1 (col1 nvarchar(10) collate Cyrillic_General_CS_AS);
    insert into #tab1 values(N'abcdШ');
    select cast(col1 as varchar(10)) from #tab1\
    `;
    execSql(done, sql, 'abcdШ');
  });

  it('should test varchar max', function(done) {
    execSql(done, "select cast('abc' as varchar(max))", 'abc', '7_2');
  });

  it('should test varchar max null', function(done) {
    execSql(done, 'select cast(null as varchar(max))', null, '7_2');
  });

  it('should test var char max long as text size', function(done) {
    let longString = '';
    for (
      let i = 1, end = config.options.textsize, asc = 1 <= end;
      asc ? i <= end : i >= end;
      asc ? i++ : i--
    ) {
      longString += 'x';
    }

    execSql(
      done,
      `select cast('${longString}' as varchar(max))`,
      longString,
      '7_2'
    );
  });

  it('should test var char max larger than text sieze', function(done) {
    let longString = '';
    for (
      let i = 1, end = config.options.textsize + 10, asc = 1 <= end;
      asc ? i <= end : i >= end;
      asc ? i++ : i--
    ) {
      longString += 'x';
    }

    execSql(
      done,
      `select cast('${longString}' as varchar(max))`,
      longString.slice(0, config.options.textsize),
      '7_2'
    );
  });

  it('should test nvarchar', function(done) {
    execSql(done, "select cast('abc' as nvarchar(10))", 'abc');
  });

  it('should test nvarchar null', function(done) {
    execSql(done, 'select cast(null as nvarchar(10))', null);
  });

  it('should test nvarchar max', function(done) {
    execSql(done, "select cast('abc' as nvarchar(max))", 'abc', '7_2');
  });

  it('should test nvarchar max null', function(done) {
    execSql(done, 'select cast(null as nvarchar(max))', null, '7_2');
  });

  it('should test varbinary', function(done) {
    execSql(
      done,
      'select cast(0x1234 as varbinary(4))',
      Buffer.from([0x12, 0x34])
    );
  });

  it('should test varbinary null', function(done) {
    execSql(done, 'select cast(null as varbinary(10))', null);
  });

  it('should test binary', function(done) {
    execSql(
      done,
      'select cast(0x1234 as binary(4))',
      Buffer.from([0x12, 0x34, 0x00, 0x00])
    );
  });

  it('should test binary null', function(done) {
    execSql(done, 'select cast(null as binary(10))', null);
  });

  it('should test varbinary max', function(done) {
    execSql(
      done,
      'select cast(0x1234 as varbinary(max))',
      Buffer.from([0x12, 0x34]),
      '7_2'
    );
  });

  it('should test varbinary max null', function(done) {
    execSql(done, 'select cast(null as varbinary(max))', null, '7_2');
  });

  it('should test char', function(done) {
    execSql(done, "select cast('abc' as char(5))", 'abc  ');
  });

  it('should test char null', function(done) {
    execSql(done, 'select cast(null as char(5))', null);
  });

  it('should test nchar', function(done) {
    execSql(done, "select cast('abc' as nchar(5))", 'abc  ');
  });

  it('should test nchar null', function(done) {
    execSql(done, 'select cast(null as nchar(5))', null);
  });

  it('should test text', function(done) {
    execSql(done, "select cast('abc' as text) as text", 'abc');
  });

  it('should test text emtpy', function(done) {
    execSql(done, "select cast('' as text) as text", '');
  });

  it('should test text null', function(done) {
    execSql(done, 'select cast(null as text) as text', null);
  });

  it('should test ntext', function(done) {
    execSql(done, "select cast('abc' as ntext) as text", 'abc');
  });

  it('should test ntext empty', function(done) {
    execSql(done, "select cast('' as ntext) as text", '');
  });

  it('should test ntext null', function(done) {
    execSql(done, 'select cast(null as ntext) as text', null);
  });

  it('should test image', function(done) {
    execSql(done, 'select cast(0x1234 as image)', Buffer.from([0x12, 0x34]));
  });

  it('should test image null', function(done) {
    execSql(done, 'select cast(null as image)', null);
  });

  it('should test guid', function(done) {
    execSql(
      done,
      "select cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier)",
      '01234567-89AB-CDEF-0123-456789ABCDEF'
    );
  });

  it('should test guid null', function(done) {
    execSql(done, 'select cast(null as uniqueidentifier)', null);
  });

  it('should test variant int', function(done) {
    execSql(done, 'select cast(11 as sql_variant)', 11, '7_2');
  });

  it('should test variant numeric', function(done) {
    execSql(done, 'select cast(11.16 as sql_variant)', 11.16, '7_2');
  });

  it('should test variant var char', function(done) {
    execSql(done, "select cast('abc' as sql_variant)", 'abc', '7_2');
  });

  it('should test variant var char 2', function(done) {
    execSql(done, "select SERVERPROPERTY('LicenseType') as LicenseType", 'DISABLED', '7_2');
  });

  it('should test variant var bin', function(done) {
    execSql(
      done,
      'select cast(0x1234 as sql_variant)',
      Buffer.from([0x12, 0x34], '7_2')
    );
  });

  it('should test variant date time off set', function(done) {
    execSql(
      done,
      "select cast(cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset) as sql_variant)",
      new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)),
      '7_3_A'
    );
  });

  it('should test variant multiple data types', function(done) {
    const sql = `\
      create table #tab1 (
      [c0] [int] IDENTITY(1,1),
      [c1] [sql_variant] NULL);
      insert into #tab1 ([c1]) values (N'abcdШ');
      insert into #tab1 ([c1]) select cast(3148.29 as decimal(20,8));
      insert into #tab1 ([c1]) select cast(0x1234 as varbinary(16));
      insert into #tab1 ([c1]) select cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier);
      insert into #tab1 ([c1]) values (0.00000090000000000); -- decimal(38,17);
      insert into #tab1 ([c1]) select cast('2011-12-4 10:04:23' as datetime);
      insert into #tab1 ([c1]) select cast('abcde' as varchar(10));
      select [c1] from #tab1 ORDER BY [c0];
      `;
    const expectedValues = [
      'abcdШ',
      3148.29,
      Buffer.from([0x12, 0x34]),
      '01234567-89AB-CDEF-0123-456789ABCDEF',
      0.00000090000000000,
      new Date('December 4, 2011 10:04:23 GMT'),
      'abcde'
    ];
    execSql(done, sql, expectedValues);
  });

  it('should test variant null', function(done) {
    execSql(done, 'select cast(null as sql_variant)', null, '7_2');
  });

  it('should test xml', function(done) {
    const xml = '<root><child attr="attr-value"/></root>';
    execSql(done, `select cast('${xml}' as xml)`, xml, '7_2');
  });

  it('should test xml null', function(done) {
    execSql(done, 'select cast(null as xml)', null, '7_2');
  });

  it('should test xml with schema', function(done) {
    // Cannot use temp tables, as schema collections as not available to them.
    // Schema must be created manually in database in order to make this done work properly (sql 2012)

    const xml = '<root/>';

    const schemaName = 'test_tedious_schema';
    const tableName = 'test_tedious_table';

    const schema = `\
  <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <xsd:element name="root">
    </xsd:element>
  </xsd:schema>`;

    const sql = `\
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

    execSql(done, sql, xml, '7_2');
  });

  it('should done udt', function(done) {
    execSql(
      done,
      "select geography::STGeomFromText('LINESTRING(-122.360 47.656, -122.343 47.656 )', 4326) as geo",
      Buffer.from([
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
  });

  it('should done udtNull', function(done) {
    execSql(done, 'select cast(null as geography)', null, '7_2');

  });
});
