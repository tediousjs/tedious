'use strict';

var Connection, Request, config, debug, execSql, fs;

Connection = require('../../src/connection');

Request = require('../../src/request');

fs = require('fs');

debug = false;

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;

config.options.textsize = 8 * 1024;

if (debug) {
  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true
  };
} else {
  config.options.debug = {};
}

exports['null'] = function(test) {
  return execSql(test, 'select null', null);
};

exports.tinyint = function(test) {
  return execSql(test, 'select cast(8 as tinyint)', 8);
};

exports.tinyintLarge = function(test) {
  return execSql(test, 'select cast(252 as tinyint)', 252);
};

exports.tinyintNull = function(test) {
  return execSql(test, 'select cast(null as tinyint)', null);
};

exports.smallint = function(test) {
  return execSql(test, 'select cast(8 as smallint)', 8);
};

exports.smallintNull = function(test) {
  return execSql(test, 'select cast(null as smallint)', null);
};

exports.int = function(test) {
  return execSql(test, 'select cast(8 as int)', 8);
};

exports.intNull = function(test) {
  return execSql(test, 'select cast(null as int)', null);
};

exports.real = function(test) {
  return execSql(test, 'select cast(9.5 as real)', 9.5);
};

exports.realNull = function(test) {
  return execSql(test, 'select cast(null as real)', null);
};

exports.float = function(test) {
  return execSql(test, 'select cast(9.5 as float)', 9.5);
};

exports.floatNull = function(test) {
  return execSql(test, 'select cast(null as float)', null);
};

exports.bigint = function(test) {
  return execSql(test, 'select cast(8 as bigint)', '8');
};

exports.bigintNull = function(test) {
  return execSql(test, 'select cast(null as bigint)', null);
};

exports.bitFalse = function(test) {
  return execSql(test, "select cast('false' as bit)", false);
};

exports.bitTrue = function(test) {
  return execSql(test, "select cast('true' as bit)", true);
};

exports.bitNull = function(test) {
  return execSql(test, 'select cast(null as bit)', null);
};

exports.datetime = function(test) {
  return execSql(test, "select cast('2011-12-4 10:04:23' as datetime)", new Date('December 4, 2011 10:04:23 GMT'));
};

exports.datetimeNull = function(test) {
  return execSql(test, 'select cast(null as datetime)', null);
};

exports.smallDatetime = function(test) {
  return execSql(test, "select cast('2011-12-4 10:04:23' as smalldatetime)", new Date('December 4, 2011 10:04:00 GMT'));
};

exports.smallDatetimeNull = function(test) {
  return execSql(test, 'select cast(null as smalldatetime)', null);
};

exports.datetime2 = function(test) {
  return execSql(test, "select cast('2011-12-4 10:04:23' as datetime2)", new Date('December 4, 2011 10:04:23 +00'), '7_3_A');
};

exports.datetime2Null = function(test) {
  return execSql(test, 'select cast(null as datetime2)', null, '7_3_A');
};

exports.time = function(test) {
  return execSql(test, "select cast('10:04:23' as time)", new Date(Date.UTC(1970, 0, 1, 10, 4, 23)), '7_3_A');
};

exports.timeNull = function(test) {
  return execSql(test, 'select cast(null as time)', null, '7_3_A');
};

exports.date = function(test) {
  return execSql(test, "select cast('2014-03-08' as date)", new Date(Date.UTC(2014, 2, 8)), '7_3_A');
};

exports.dateNull = function(test) {
  return execSql(test, 'select cast(null as date)', null, '7_3_A');
};

exports.dateTimeOffset = function(test) {
  return execSql(test, "select cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset)", new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)), '7_3_A');
};

exports.dateTimeOffsetNull = function(test) {
  return execSql(test, 'select cast(null as datetimeoffset)', null);
};

exports.numericSmallValue = function(test) {
  return execSql(test, 'select cast(9.3 as numeric(3,2))', 9.3);
};

exports.numericLargeValue = function(test) {
  return execSql(test, 'select cast(9876543.3456 as numeric(12,5))', 9876543.3456);
};

exports.numericVeryLargeValue = function(test) {
  return execSql(test, 'select cast(9876543219876543.3456 as numeric(25,5))', 9876543219876543.3456);
};

exports.numericExtremelyLargeValue = function(test) {
  return execSql(test, 'select cast(98765432198765432198765432.3456 as numeric(35,5))', 98765432198765432198765432.3456);
};

exports.numericNull = function(test) {
  return execSql(test, 'select cast(null as numeric(3,2))', null);
};

exports.smallMoney = function(test) {
  return execSql(test, 'select cast(1.22229 as smallmoney)', 1.2223);
};

exports.smallMoneyNegative = function(test) {
  return execSql(test, 'select cast(-1.22229 as smallmoney)', -1.2223);
};

exports.smallMoneyNull = function(test) {
  return execSql(test, 'select cast(null as smallmoney)', null);
};

exports.money = function(test) {
  return execSql(test, 'select cast(1.22229 as money)', 1.2223);
};

exports.moneyNegative = function(test) {
  return execSql(test, 'select cast(-1.22229 as money)', -1.2223);
};

exports.moneyLarge = function(test) {
  return execSql(test, 'select cast(123456789012345.11 as money)', 123456789012345.11);
};

exports.moneyLargeNegative = function(test) {
  return execSql(test, 'select cast(-123456789012345.11 as money)', -123456789012345.11);
};

exports.moneyNull = function(test) {
  return execSql(test, 'select cast(null as money)', null);
};

exports.varchar = function(test) {
  return execSql(test, "select cast('abcde' as varchar(10))", 'abcde');
};

exports.varcharEmpty = function(test) {
  return execSql(test, "select cast('' as varchar(10))", '');
};

exports.varcharNull = function(test) {
  return execSql(test, 'select cast(null as varchar(10))', null);
};

exports.varcharCollation = function(test) {
  var sql;
  sql = "create table #tab1 (col1 nvarchar(10) collate Cyrillic_General_CS_AS);\ninsert into #tab1 values(N'abcdШ');\nselect cast(col1 as varchar(10)) from #tab1";
  return execSql(test, sql, 'abcdШ');
};

exports.varcharMax = function(test) {
  return execSql(test, "select cast('abc' as varchar(max))", 'abc', '7_2');
};

exports.varcharMaxNull = function(test) {
  return execSql(test, 'select cast(null as varchar(max))', null, '7_2');
};

exports.varcharMaxLongAsTextSize = function(test) {
  var i, longString, ref;
  longString = '';
  for (i = 1, ref = config.options.textsize; 1 <= ref ? i <= ref : i >= ref; 1 <= ref ? ++i : --i) {
    longString += 'x';
  }
  return execSql(test, "select cast('" + longString + "' as varchar(max))", longString, '7_2');
};

exports.varcharMaxLargerThanTextSize = function(test) {
  var i, longString, ref;
  longString = '';
  for (i = 1, ref = config.options.textsize + 10; 1 <= ref ? i <= ref : i >= ref; 1 <= ref ? ++i : --i) {
    longString += 'x';
  }
  return execSql(test, "select cast('" + longString + "' as varchar(max))", longString.slice(0, config.options.textsize), '7_2');
};

exports.nvarchar = function(test) {
  return execSql(test, "select cast('abc' as nvarchar(10))", 'abc');
};

exports.nvarcharNull = function(test) {
  return execSql(test, 'select cast(null as nvarchar(10))', null);
};

exports.nvarcharMax = function(test) {
  return execSql(test, "select cast('abc' as nvarchar(max))", 'abc', '7_2');
};

exports.nvarcharMaxNull = function(test) {
  return execSql(test, 'select cast(null as nvarchar(max))', null, '7_2');
};

exports.varbinary = function(test) {
  return execSql(test, 'select cast(0x1234 as varbinary(4))', new Buffer([0x12, 0x34]));
};

exports.varbinaryNull = function(test) {
  return execSql(test, 'select cast(null as varbinary(10))', null);
};

exports.binary = function(test) {
  return execSql(test, 'select cast(0x1234 as binary(4))', new Buffer([0x12, 0x34, 0x00, 0x00]));
};

exports.binaryNull = function(test) {
  return execSql(test, 'select cast(null as binary(10))', null);
};

exports.varbinaryMax = function(test) {
  return execSql(test, 'select cast(0x1234 as varbinary(max))', new Buffer([0x12, 0x34]), '7_2');
};

exports.varbinaryMaxNull = function(test) {
  return execSql(test, 'select cast(null as varbinary(max))', null, '7_2');
};

exports.char = function(test) {
  return execSql(test, "select cast('abc' as char(5))", 'abc  ');
};

exports.charNull = function(test) {
  return execSql(test, 'select cast(null as char(5))', null);
};

exports.nchar = function(test) {
  return execSql(test, "select cast('abc' as nchar(5))", 'abc  ');
};

exports.ncharNull = function(test) {
  return execSql(test, 'select cast(null as nchar(5))', null);
};

exports.text = function(test) {
  return execSql(test, "select cast('abc' as text) as text", 'abc');
};

exports.textEmpty = function(test) {
  return execSql(test, "select cast('' as text) as text", '');
};

exports.textNull = function(test) {
  return execSql(test, 'select cast(null as text) as text', null);
};

exports.ntext = function(test) {
  return execSql(test, "select cast('abc' as ntext) as text", 'abc');
};

exports.ntextEmpty = function(test) {
  return execSql(test, "select cast('' as ntext) as text", '');
};

exports.ntextNull = function(test) {
  return execSql(test, 'select cast(null as ntext) as text', null);
};

exports.image = function(test) {
  return execSql(test, 'select cast(0x1234 as image)', new Buffer([0x12, 0x34]));
};

exports.imageNull = function(test) {
  return execSql(test, 'select cast(null as image)', null);
};

exports.guid = function(test) {
  return execSql(test, "select cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier)", '01234567-89AB-CDEF-0123-456789ABCDEF');
};

exports.guidNull = function(test) {
  return execSql(test, 'select cast(null as uniqueidentifier)', null);
};

exports.variantInt = function(test) {
  return execSql(test, 'select cast(11 as sql_variant)', 11, '7_2');
};

exports.variantNumeric = function(test) {
  return execSql(test, 'select cast(11.16 as sql_variant)', 11.16, '7_2');
};

exports.variantVarChar = function(test) {
  return execSql(test, "select cast('abc' as sql_variant)", 'abc', '7_2');
};

exports.variantVarBin = function(test) {
  return execSql(test, 'select cast(0x1234 as sql_variant)', new Buffer([0x12, 0x34], '7_2'));
};

exports.variantDateTimeOffset = function(test) {
  return execSql(test, "select cast(cast('2014-02-14 22:59:59.9999999 +05:00' as datetimeoffset) as sql_variant)", new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)), '7_3_A');
};

exports.variantNull = function(test) {
  return execSql(test, 'select cast(null as sql_variant)', null, '7_2');
};

exports.xml = function(test) {
  var xml;
  xml = '<root><child attr="attr-value"/></root>';
  return execSql(test, "select cast('" + xml + "' as xml)", xml, '7_2');
};

exports.xmlNull = function(test) {
  return execSql(test, 'select cast(null as xml)', null, '7_2');
};

exports.xmlWithSchema = function(test) {
  var schema, schemaName, sql, tableName, xml;
  xml = '<root/>';
  schemaName = 'test_tedious_schema';
  tableName = 'test_tedious_table';
  schema = '<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n  <xsd:element name="root">\n  </xsd:element>\n</xsd:schema>';
  sql = "IF OBJECT_ID('" + tableName + "', 'U') IS NOT NULL\n  DROP TABLE [" + tableName + "];\n\nIF EXISTS (SELECT * FROM [sys].[xml_schema_collections] WHERE [name] = '" + schemaName + "' AND [schema_id] = SCHEMA_ID())\n  DROP XML SCHEMA COLLECTION [" + schemaName + '];\n\nCREATE XML SCHEMA COLLECTION [' + schemaName + "] AS N'" + schema + "';\n\nEXEC('CREATE TABLE [" + tableName + '] ([xml] [xml]([' + schemaName + "]))');\n\nINSERT INTO [" + tableName + "] ([xml]) VALUES ('" + xml + "');\n\nSELECT [xml] FROM [" + tableName + '];';
  return execSql(test, sql, xml, '7_2');
};

exports.udt = function(test) {
  return execSql(test, "select geography::STGeomFromText('LINESTRING(-122.360 47.656, -122.343 47.656 )', 4326) as geo", new Buffer([230, 16, 0, 0, 1, 20, 135, 22, 217, 206, 247, 211, 71, 64, 215, 163, 112, 61, 10, 151, 94, 192, 135, 22, 217, 206, 247, 211, 71, 64, 203, 161, 69, 182, 243, 149, 94, 192]), '7_2');
};

exports.udtNull = function(test) {
  return execSql(test, 'select cast(null as geography)', null, '7_2');
};

execSql = function(test, sql, expectedValue, tdsVersion) {
  var connection, request;
  if (tdsVersion && tdsVersion > config.options.tdsVersion) {
    return test.done();
  }
  test.expect(3);
  request = new Request(sql, function(err) {
    test.ifError(err);
    return connection.close();
  });
  request.on('row', function(columns) {
    if (expectedValue instanceof Date) {
      return test.strictEqual(columns[0].value.getTime(), expectedValue.getTime());
    } else if (expectedValue instanceof Array || expectedValue instanceof Buffer) {
      return test.deepEqual(columns[0].value, expectedValue);
    } else {
      return test.strictEqual(columns[0].value, expectedValue);
    }
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.execSqlBatch(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('errorMessage', function(error) {
    return console.log(error.number + ' : ' + error.message);
  });
  return connection.on('debug', function(message) {
    if (debug) {
      return console.log(message);
    }
  });
};
