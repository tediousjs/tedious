async = require('async')
Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')

debug = false

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config
config.options.textsize = 8 * 1024

if (debug)
  config.options.debug =
    packet: true
    data: true
    payload: true
    token: true
    log: true
else
  config.options.debug = {}

config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION

exports.null = (test) ->
  execSql(test, 'select null', null)

exports.tinyint = (test) ->
  execSql(test, 'select cast(8 as tinyint)', 8)

exports.tinyintLarge = (test) ->
  execSql(test, 'select cast(252 as tinyint)', 252)

exports.tinyintNull = (test) ->
  execSql(test, 'select cast(null as tinyint)', null)

exports.smallint = (test) ->
  execSql(test, 'select cast(8 as smallint)', 8)

exports.smallintNull = (test) ->
  execSql(test, 'select cast(null as smallint)', null)

exports.int = (test) ->
  execSql(test, 'select cast(8 as int)', 8)

exports.intNull = (test) ->
  execSql(test, 'select cast(null as int)', null)

exports.real = (test) ->
  execSql(test, 'select cast(9.5 as real)', 9.5)

exports.realNull = (test) ->
  execSql(test, 'select cast(null as real)', null)

exports.float = (test) ->
  execSql(test, 'select cast(9.5 as float)', 9.5)

exports.floatNull = (test) ->
  execSql(test, 'select cast(null as float)', null)

exports.bigint = (test) ->
  execSql(test, 'select cast(8 as bigint)', '8')

exports.bigintNull = (test) ->
  execSql(test, 'select cast(null as bigint)', null)

exports.bitFalse = (test) ->
  execSql(test, "select cast('false' as bit)", false)

exports.bitTrue = (test) ->
  execSql(test, "select cast('true' as bit)", true)

exports.bitNull = (test) ->
  execSql(test, "select cast(null as bit)", null)

exports.datetime = (test) ->
  execSql(test, "select cast('2011-12-4 10:04:23' as datetime)", new Date('December 4, 2011 10:04:23 GMT'))

exports.datetimeNull = (test) ->
  execSql(test, "select cast(null as datetime)", null)

exports.smallDatetime = (test) ->
  execSql(test, "select cast('2011-12-4 10:04:23' as smalldatetime)", new Date('December 4, 2011 10:04:00 GMT'))

exports.smallDatetimeNull = (test) ->
  execSql(test, "select cast(null as smalldatetime)", null)

exports.datetime2 = (test) ->
  execSql(test, "select cast('2011-12-4 10:04:23' as datetime2)", new Date('December 4, 2011 10:04:23 +00'), '7_3_A')

exports.datetime2Null = (test) ->
  execSql(test, "select cast(null as datetime2)", null, '7_3_A')

exports.time = (test) ->
  execSql(test, "select cast('10:04:23' as time)", new Date(Date.UTC(1970, 0, 1, 10, 4, 23)), '7_3_A')

exports.timeNull = (test) ->
  execSql(test, "select cast(null as time)", null, '7_3_A')

exports.date = (test) ->
  execSql(test, "select cast('2014-03-08' as date)", new Date(Date.UTC(2014, 2, 8)), '7_3_A')

exports.dateNull = (test) ->
  execSql(test, "select cast(null as date)", null, '7_3_A')

exports.dateTimeOffset = (test) ->
  execSql(test, "select cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset)", new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)), '7_3_A')

exports.dateTimeOffsetNull = (test) ->
  execSql(test, "select cast(null as datetimeoffset)", null)

exports.numericSmallValue = (test) ->
  execSql(test, "select cast(9.3 as numeric(3,2))", 9.3)

exports.numericLargeValue = (test) ->
  execSql(test, "select cast(9876543.3456 as numeric(12,5))", 9876543.3456)

exports.numericVeryLargeValue = (test) ->
  execSql(test, "select cast(9876543219876543.3456 as numeric(25,5))", 9876543219876543.3456)

exports.numericExtremelyLargeValue = (test) ->
  execSql(test, "select cast(98765432198765432198765432.3456 as numeric(35,5))", 98765432198765432198765432.3456)

exports.numericNull = (test) ->
  execSql(test, "select cast(null as numeric(3,2))", null)

exports.smallMoney = (test) ->
  execSql(test, "select cast(1.22229 as smallmoney)", 1.2223)

exports.smallMoneyNegative = (test) ->
  execSql(test, "select cast(-1.22229 as smallmoney)", -1.2223)

exports.smallMoneyNull = (test) ->
  execSql(test, "select cast(null as smallmoney)", null)

exports.money = (test) ->
  execSql(test, "select cast(1.22229 as money)", 1.2223)

exports.moneyNegative = (test) ->
  execSql(test, "select cast(-1.22229 as money)", -1.2223)

exports.moneyLarge = (test) ->
  execSql(test, "select cast(123456789012345.11 as money)", 123456789012345.11)

exports.moneyLargeNegative = (test) ->
  execSql(test, "select cast(-123456789012345.11 as money)", -123456789012345.11)

exports.moneyNull = (test) ->
  execSql(test, "select cast(null as money)", null)

exports.varchar = (test) ->
  execSql(test, "select cast('abcde' as varchar(10))", 'abcde')

exports.varcharEmpty = (test) ->
  execSql(test, "select cast('' as varchar(10))", '')

exports.varcharNull = (test) ->
  execSql(test, "select cast(null as varchar(10))", null)

exports.varcharCollation = (test) ->
  # The codepage used is WINDOWS-1251.
  sql = """
    create table #tab1 (col1 nvarchar(10) collate Cyrillic_General_CS_AS);
    insert into #tab1 values(N'abcdШ');
    select cast(col1 as varchar(10)) from #tab1
    """
  execSql(test, sql, 'abcdШ')

exports.varcharMax = (test) ->
  execSql(test, "select cast('abc' as varchar(max))", 'abc', '7_2')

exports.varcharMaxNull = (test) ->
  execSql(test, "select cast(null as varchar(max))", null, '7_2')

exports.varcharMaxLongAsTextSize = (test) ->
  longString = ''
  for i in [1..config.options.textsize]
    longString += 'x'

  execSql(test, "select cast('#{longString}' as varchar(max))", longString, '7_2')

exports.varcharMaxLargerThanTextSize = (test) ->
  longString = ''
  for i in [1..config.options.textsize + 10]
    longString += 'x'

  execSql(test, "select cast('#{longString}' as varchar(max))", longString.slice(0, config.options.textsize), '7_2')

exports.nvarchar = (test) ->
  execSql(test, "select cast('abc' as nvarchar(10))", 'abc')

exports.nvarcharNull = (test) ->
  execSql(test, "select cast(null as nvarchar(10))", null)

exports.nvarcharMax = (test) ->
  execSql(test, "select cast('abc' as nvarchar(max))", 'abc', '7_2')

exports.nvarcharMaxNull = (test) ->
  execSql(test, "select cast(null as nvarchar(max))", null, '7_2')

exports.varbinary = (test) ->
  execSql(test, "select cast(0x1234 as varbinary(4))", new Buffer [0x12, 0x34])

exports.varbinaryNull = (test) ->
  execSql(test, "select cast(null as varbinary(10))", null)

exports.binary = (test) ->
  execSql(test, "select cast(0x1234 as binary(4))", new Buffer [0x12, 0x34, 0x00, 0x00])

exports.binaryNull = (test) ->
  execSql(test, "select cast(null as binary(10))", null)

exports.varbinaryMax = (test) ->
  execSql(test, "select cast(0x1234 as varbinary(max))", new Buffer([0x12, 0x34]), '7_2')

exports.varbinaryMaxNull = (test) ->
  execSql(test, "select cast(null as varbinary(max))", null, '7_2')

exports.char = (test) ->
  execSql(test, "select cast('abc' as char(5))", 'abc  ')

exports.charNull = (test) ->
  execSql(test, "select cast(null as char(5))", null)

exports.nchar = (test) ->
  execSql(test, "select cast('abc' as nchar(5))", 'abc  ')

exports.ncharNull = (test) ->
  execSql(test, "select cast(null as nchar(5))", null)

exports.text = (test) ->
  execSql(test, "select cast('abc' as text) as text", 'abc')

exports.textEmpty = (test) ->
  execSql(test, "select cast('' as text) as text", '')

exports.textNull = (test) ->
  execSql(test, "select cast(null as text) as text", null)

exports.ntext = (test) ->
  execSql(test, "select cast('abc' as ntext) as text", 'abc')

exports.ntextEmpty = (test) ->
  execSql(test, "select cast('' as ntext) as text", '')

exports.ntextNull = (test) ->
  execSql(test, "select cast(null as ntext) as text", null)

exports.image = (test) ->
  execSql(test, "select cast(0x1234 as image)", new Buffer [0x12, 0x34])

exports.imageNull = (test) ->
  execSql(test, "select cast(null as image)", null)

exports.guid = (test) ->
  execSql(test, "select cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier)", '01234567-89AB-CDEF-0123-456789ABCDEF')

exports.guidNull = (test) ->
  execSql(test, "select cast(null as uniqueidentifier)", null)

exports.variantInt = (test) ->
  execSql(test, "select cast(11 as sql_variant)", 11, '7_2')

exports.variantNumeric = (test) ->
  execSql(test, "select cast(11.16 as sql_variant)", 11.16, '7_2')

exports.variantVarChar = (test) ->
  execSql(test, "select cast('abc' as sql_variant)", 'abc', '7_2')

exports.variantVarBin = (test) ->
  execSql(test, "select cast(0x1234 as sql_variant)", new Buffer [0x12, 0x34], '7_2')

exports.variantDateTimeOffset = (test) ->
  execSql(test, "select cast(cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset) as sql_variant)", new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)), '7_3_A')

exports.variantNull = (test) ->
  execSql(test, "select cast(null as sql_variant)", null, '7_2')

exports.xml = (test) ->
  xml = '<root><child attr="attr-value"/></root>'
  execSql(test, "select cast('#{xml}' as xml)", xml, '7_2')

exports.xmlNull = (test) ->
  execSql(test, "select cast(null as xml)", null, '7_2')

exports.xmlWithSchema = (test) ->
  # Cannot use temp tables, as schema collections as not available to them.
  # Schema must be created manually in database in order to make this test work properly (sql 2012)

  xml = '<root/>'

  schemaName = 'test_tedious_schema'
  tableName = 'test_tedious_table'

  schema = '''
    <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <xsd:element name="root">
      </xsd:element>
    </xsd:schema>'''

  sql = """
    IF OBJECT_ID('#{tableName}', 'U') IS NOT NULL
      DROP TABLE [#{tableName}];

    IF EXISTS (SELECT * FROM [sys].[xml_schema_collections] WHERE [name] = '#{schemaName}' AND [schema_id] = SCHEMA_ID())
      DROP XML SCHEMA COLLECTION [#{schemaName}];

    CREATE XML SCHEMA COLLECTION [#{schemaName}] AS N'#{schema}';

    EXEC('CREATE TABLE [#{tableName}] ([xml] [xml]([#{schemaName}]))');

    INSERT INTO [#{tableName}] ([xml]) VALUES ('#{xml}');

    SELECT [xml] FROM [#{tableName}];
  """

  execSql(test, sql, xml, '7_2')

exports.udt = (test) ->
  execSql(test, "select geography::STGeomFromText('LINESTRING(-122.360 47.656, -122.343 47.656 )', 4326) as geo", new Buffer([230,16,0,0,1,20,135,22,217,206,247,211,71,64,215,163,112,61,10,151,94,192,135,22,217,206,247,211,71,64,203,161,69,182,243,149,94,192]), '7_2')

exports.udtNull = (test) ->
  execSql(test, "select cast(null as geography)", null, '7_2')

execSql = (test, sql, expectedValue, tdsVersion) ->
  if tdsVersion and tdsVersion > config.options.tdsVersion
  	return test.done()

  test.expect(3)

  request = new Request(sql, (err) ->
    test.ifError(err)

    connection.close()
  )

  request.on('row', (columns) ->
    if expectedValue instanceof Date
      test.strictEqual(columns[0].value.getTime(), expectedValue.getTime())
    else if expectedValue instanceof Array or expectedValue instanceof Buffer
      test.deepEqual(columns[0].value, expectedValue)
    else
      test.strictEqual(columns[0].value, expectedValue)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ifError(err)
    connection.execSqlBatch(request)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('errorMessage', (error) ->
    console.log("#{error.number} : #{error.message}")
  )

  connection.on('debug', (message) ->
    if (debug)
      console.log(message)
  )
