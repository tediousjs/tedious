async = require('async')
Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
assert = require("chai").assert

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

describe "Selecting different data types", ->
  beforeEach (done) ->
    @connection = new Connection(config)
    @connection.on('connect', done)

  afterEach ->
    @connection.close if @connection

  assertResult = (sql, expectedValue, tdsVersion) ->
    (done) ->
      if tdsVersion and tdsVersion > config.options.tdsVersion
        return done()

      rows = 0
      request = new Request sql, (err) ->
        return done(err) if err

        assert.strictEqual(rows, 1)

        done()

      request.on 'row', (columns) ->
        rows++;

        if expectedValue instanceof Date
          assert.strictEqual(columns[0].value.getTime(), expectedValue.getTime())
        else if expectedValue instanceof Array or expectedValue instanceof Buffer
          assert.deepEqual(columns[0].value, expectedValue)
        else
          assert.strictEqual(columns[0].value, expectedValue)

      @connection.execSqlBatch request

  it "can handle 'null'", assertResult('select null', null)

  it "can handle 'tinyint'", assertResult('select cast(8 as tinyint)', 8)
  it "can handle 'tinyint' (large)", assertResult('select cast(252 as tinyint)', 252)
  it "can handle 'tinyint' (null)", assertResult('select cast(null as tinyint)', null)

  it "can handle 'smallint'", assertResult('select cast(8 as smallint)', 8)
  it "can handle 'smallint' (null)", assertResult('select cast(null as smallint)', null)

  it "can handle 'int'", assertResult('select cast(8 as int)', 8)
  it "can handle 'int' (null)", assertResult('select cast(null as int)', null)

  it "can handle 'real'", assertResult('select cast(8 as real)', 8)
  it "can handle 'real' (null)", assertResult('select cast(null as real)', null)

  it "can handle 'float'", assertResult('select cast(8 as float)', 8.0)
  it "can handle 'float' (null)", assertResult('select cast(null as float)', null)

  it "can handle 'bigint'", assertResult('select cast(8 as bigint)', '8')
  it "can handle 'bigint' (null)", assertResult('select cast(null as bigint)', null)

  it "can handle 'bit' (true)", assertResult("select cast('true' as bit)", true)
  it "can handle 'bit' (false)", assertResult("select cast('false' as bit)", false)
  it "can handle 'bit' (null)", assertResult("select cast(null as bit)", null)

  it "can handle 'datetime'", assertResult("select cast('2011-12-4 10:04:23' as datetime)", new Date('December 4, 2011 10:04:23 GMT'))
  it "can handle 'datetime' (null)", assertResult("select cast(null as datetime)", null)

  it "can handle 'smalldatetime'", assertResult("select cast('2011-12-4 10:04:23' as smalldatetime)", new Date('December 4, 2011 10:04:00 GMT'))
  it "can handle 'smalldatetime' (null)", assertResult("select cast(null as smalldatetime)", null)

  it "can handle 'datetime2'", assertResult("select cast('2011-12-4 10:04:23' as datetime2)", new Date('December 4, 2011 10:04:23 +00'), '7_3_A')
  it "can handle 'datetime2' (null)", assertResult("select cast(null as datetime2)", null, '7_3_A')

  it "can handle 'time'", assertResult("select cast('10:04:23' as time)", new Date(Date.UTC(1970, 0, 1, 10, 4, 23)), '7_3_A')
  it "can handle 'time' (null)", assertResult("select cast(null as time)", null, '7_3_A')

  it "can handle 'date'", assertResult("select cast('2014-03-08' as date)", new Date(Date.UTC(2014, 2, 8)), '7_3_A')
  it "can handle 'date' (null)", assertResult("select cast(null as date)", null, '7_3_A')

  it "can handle 'datetimeoffset'", assertResult("select cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset)", new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)), '7_3_A')
  it "can handle 'datetimeoffset' (null)", assertResult("select cast(null as datetimeoffset)", null, '7_3_A')

  it "can handle 'numeric'", assertResult("select cast(9.3 as numeric(3,2))", 9.3)
  it "can handle 'numeric' (large)", assertResult("select cast(9876543.3456 as numeric(12,5))", 9876543.3456)
  it "can handle 'numeric' (very large)", assertResult("select cast(9876543219876543.3456 as numeric(25,5))", 9876543219876543.3456)
  it "can handle 'numeric' (extremely large)", assertResult("select cast(98765432198765432198765432.3456 as numeric(35,5))", 98765432198765432198765432.3456)
  it "can handle 'numeric' (null)", assertResult("select cast(null as numeric(3,2))", null)

  it "can handle 'smallmoney'", assertResult("select cast(1.22229 as smallmoney)", 1.2223)
  it "can handle 'smallmoney' (negative)", assertResult("select cast(-1.22229 as smallmoney)", -1.2223)
  it "can handle 'smallmoney' (null)", assertResult("select cast(null as smallmoney)", null)

  it "can handle 'money'", assertResult("select cast(1.22229 as money)", 1.2223)
  it "can handle 'money' (negative)", assertResult("select cast(-1.22229 as money)", -1.2223)
  it "can handle 'money' (large)", assertResult("select cast(123456789012345.11 as money)", 123456789012345.11)
  it "can handle 'money' (large negative)", assertResult("select cast(-123456789012345.11 as money)", -123456789012345.11)
  it "can handle 'money' (null)", assertResult("select cast(null as money)", null)

  it "can handle 'varchar'", assertResult("select cast('abcde' as varchar(10))", 'abcde')
  it "can handle 'varchar' (empty)", assertResult("select cast('' as varchar(10))", '')
  it "can handle 'varchar' (null)", assertResult("select cast(null as varchar(10))", null)
  # The codepage used is WINDOWS-1251.
  it "can handle 'varchar' (collation)", assertResult("""
    create table #tab1 (col1 nvarchar(10) collate Cyrillic_General_CS_AS);
    insert into #tab1 values(N'abcdШ');
    select cast(col1 as varchar(10)) from #tab1
  """, 'abcdШ')
  it "can handle 'varchar' (max)", assertResult("select cast('abc' as varchar(max))", 'abc', '7_2')
  it "can handle 'varchar' (max null)", assertResult("select cast(null as varchar(max))", null, '7_2')
  it "can handle 'varchar' (max, textsize)", (done) ->
    longString = Array(config.options.textsize).join("x")
    assertResult("select cast('#{longString}' as varchar(max))", longString, '7_2').call(this, done)
  it "can handle 'varchar' (max, longer as textsize)", (done) ->
    longString = Array(config.options.textsize + 10).join("x")
    assertResult("select cast('#{longString}' as varchar(max))", longString.slice(0, config.options.textsize), '7_2').call(this, done)

  it "can handle 'nvarchar'", assertResult("select cast('abc' as nvarchar(10))", 'abc')
  it "can handle 'nvarchar' (null)", assertResult("select cast(null as nvarchar(10))", null)
  it "can handle 'nvarchar' (max)", assertResult("select cast('abc' as nvarchar(max))", 'abc', '7_2')
  it "can handle 'nvarchar' (max null)", assertResult("select cast(null as nvarchar(max))", null, '7_2')

  it "can handle 'varbinary'", assertResult("select cast(0x1234 as varbinary(4))", new Buffer([0x12, 0x34]))
  it "can handle 'varbinary' (null)", assertResult("select cast(null as varbinary(4))", null)
  it "can handle 'varbinary' (max)", assertResult("select cast(0x1234 as varbinary(max))", new Buffer([0x12, 0x34]), '7_2')
  it "can handle 'varbinary' (max null)", assertResult("select cast(null as varbinary(max))", null, '7_2')

  it "can handle 'binary'", assertResult("select cast(0x1234 as binary(4))", new Buffer([0x12, 0x34, 0x00, 0x00]))
  it "can handle 'binary' (null)", assertResult("select cast(null as binary(4))", null)

  it "can handle 'char'", assertResult("select cast('abc' as char(5))", 'abc  ')
  it "can handle 'char' (null)", assertResult("select cast(null as char(5))", null)

  it "can handle 'nchar'", assertResult("select cast('abc' as nchar(5))", 'abc  ')
  it "can handle 'nchar' (null)", assertResult("select cast(null as nchar(5))", null)

  it "can handle 'text'", assertResult("select cast('abc' as text)", 'abc')
  it "can handle 'text' (empty)", assertResult("select cast('' as text)", '')
  it "can handle 'text' (null)", assertResult("select cast(null as text)", null)

  it "can handle 'ntext'", assertResult("select cast('abc' as ntext)", 'abc')
  it "can handle 'ntext' (empty)", assertResult("select cast('' as ntext)", '')
  it "can handle 'ntext' (null)", assertResult("select cast(null as ntext)", null)

  it "can handle 'image'", assertResult("select cast(0x1234 as image)", new Buffer([0x12, 0x34]))
  it "can handle 'image' (null)", assertResult("select cast(null as image)", null)

  it "can handle 'uniqueidentifier'", assertResult("select cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier)", '01234567-89AB-CDEF-0123-456789ABCDEF')
  it "can handle 'uniqueidentifier' (null)", assertResult("select cast(null as uniqueidentifier)", null)

  it "can handle 'geography'", assertResult("select geography::STGeomFromText('LINESTRING(-122.360 47.656, -122.343 47.656 )', 4326)", new Buffer([230,16,0,0,1,20,135,22,217,206,247,211,71,64,215,163,112,61,10,151,94,192,135,22,217,206,247,211,71,64,203,161,69,182,243,149,94,192]), '7_2')
  it "can handle 'geography' (null)", assertResult("select cast(null as geography)", null, '7_2')

  it "can handle 'xml'", (done) ->
    xml = '<root><child attr="attr-value"/></root>'
    assertResult("select cast('#{xml}' as xml)", xml, '7_2').call(this, done)
  it "can handle 'xml' (null)", assertResult("select cast(null as xml)", null, '7_2')
  it "can handle 'xml' (with schema)", (done) ->
    # Cannot use temp tables, as schema collections as not available to them.
    # Schema must be created manually in database in order to make this test work properly (sql 2012)
    schemaName = 'test_tedious_schema'
    tableName = 'test_tedious_table'
    schema = '''
      <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <xsd:element name="root">
        </xsd:element>
      </xsd:schema>'''

    xml = '<root/>'

    setupStatements = [
      "IF object_id('test_tedious_table', 'U') is not null
        drop table #{tableName};"

      "IF EXISTS (SELECT * FROM sys.xml_schema_collections WHERE name = '#{schemaName}')
        DROP XML SCHEMA COLLECTION #{schemaName};",

      "CREATE XML SCHEMA COLLECTION #{schemaName} as N'#{schema}';",

      "create table #{tableName} (xml XML (#{schemaName}));",

      "insert into #{tableName} (xml) values('#{xml}');"
    ]

    execSetupStatements = (done) =>
      return done(null) if !setupStatements.length

      @connection.execSqlBatch(new Request(setupStatements.shift(), (err) ->
        return done(err) if (err)

        execSetupStatements(done)
      ))

    execSetupStatements (err) =>
      return done(err) if err

      assertResult("select xml from #{tableName};", xml, '7_2').call(this, done)
