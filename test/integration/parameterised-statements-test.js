var Connection = require('../../src/connection');
var Request = require('../../src/request');
var fs = require('fs');
var TYPES = require('../../src/data-type').typeByName;

var getConfig = function() {
  var config = JSON.parse(
    fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')
  ).config;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true
  };

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  return config;
};

exports.bitTrue = function(test) {
  return execSql(test, TYPES.Bit, true);
};

exports.bitFalse = function(test) {
  return execSql(test, TYPES.Bit, false);
};

exports.bitNull = function(test) {
  return execSql(test, TYPES.Bit, null);
};

exports.tinyInt = function(test) {
  return execSql(test, TYPES.TinyInt, 8);
};

exports.tinyIntZero = function(test) {
  return execSql(test, TYPES.TinyInt, 0);
};

exports.tinyIntLarge = function(test) {
  return execSql(test, TYPES.TinyInt, 252);
};

exports.tinyIntNull = function(test) {
  return execSql(test, TYPES.TinyInt, null);
};

exports.smallInt = function(test) {
  return execSql(test, TYPES.SmallInt, 8);
};

exports.smallIntZero = function(test) {
  return execSql(test, TYPES.SmallInt, 0);
};

exports.smallIntNull = function(test) {
  return execSql(test, TYPES.SmallInt, null);
};

exports.int = function(test) {
  return execSql(test, TYPES.Int, 8);
};

exports.bigint = function(test) {
  return execSql(test, TYPES.BigInt, 9007199254740991);
};

exports.bigint1 = function(test) {
  return execSql(test, TYPES.BigInt, 1);
};

exports.bigintsmall = function(test) {
  return execSql(test, TYPES.BigInt, -9007199254740991);
};

exports.bigintsmall1 = function(test) {
  return execSql(test, TYPES.BigInt, -1);
};

exports.real = function(test) {
  return execSql(test, TYPES.Real, 9654.2529296875);
};

exports.float = function(test) {
  return execSql(test, TYPES.Float, 9654.2546456567565767644);
};

exports.numeric = function(test) {
  return execSql(test, TYPES.Numeric, 5555);
};

exports.numericLargeValue = function(test) {
  return execSql(test, TYPES.Numeric, 5.555555555555553333, null, {
    precision: 19,
    scale: 18
  });
};

exports.numericNegative = function(test) {
  return execSql(test, TYPES.Numeric, -5555.55, null, {
    precision: 6,
    scale: 2
  });
};

exports.decimal = function(test) {
  return execSql(test, TYPES.Decimal, 5555);
};

exports.decimalLargeValue = function(test) {
  return execSql(test, TYPES.Decimal, 5.555555555555553333, null, {
    precision: 19,
    scale: 18
  });
};

exports.decimalNegative = function(test) {
  return execSql(test, TYPES.Decimal, -5555.55, null, {
    precision: 6,
    scale: 2
  });
};

exports.smallMoney = function(test) {
  return execSql(test, TYPES.SmallMoney, 9842.4566);
};

exports.money = function(test) {
  return execSql(test, TYPES.Money, 956455842.4566);
};

exports.uniqueIdentifierN = function(test) {
  return execSql(
    test,
    TYPES.UniqueIdentifierN,
    '01234567-89AB-CDEF-0123-456789ABCDEF'
  );
};

exports.intZero = function(test) {
  return execSql(test, TYPES.Int, 0);
};

exports.intNull = function(test) {
  return execSql(test, TYPES.Int, null);
};

exports.varChar = function(test) {
  return execSql(test, TYPES.VarChar, 'qaz');
};

/* Per 2.2.5.4.3, lengths greater than 8000 only supported version 7.2 and beyond. */
exports.varCharN = function(test) {
  return execSql(test, TYPES.VarChar, 'qaz', null, { length: 8000 });
};

exports.varCharN_7_2_AndLater = function(test) {
  return execSql(test, TYPES.VarChar, 'qaz', '7_2', { length: 8001 });
};

exports.varCharEmptyString = function(test) {
  return execSql(test, TYPES.VarChar, '');
};

exports.varCharNull = function(test) {
  return execSql(test, TYPES.VarChar, null);
};

exports.varCharMax = function(test) {
  var longString = '';
  for (
    var i = 1, end = 10 * 1000, asc = 1 <= end;
    asc ? i <= end : i >= end;
    asc ? i++ : i--
  ) {
    longString += 'x';
  }

  return execSql(test, TYPES.VarChar, longString, '7_2');
};

exports.varCharMaxEmptyString = function(test) {
  return execSql(test, TYPES.VarChar, '', null, { length: 8000 });
};

exports.varCharMaxEmptyString_7_2_AndLater = function(test) {
  return execSql(test, TYPES.VarChar, '', '7_2', { length: 8001 });
};

exports.nVarChar = function(test) {
  return execSql(test, TYPES.NVarChar, 'qaz');
};

/*
Per 2.2.5.4.3, lengths greater than 8000 only supported version 7.2 and
beyond. Since NVarChar is unicode, that'd be 4000. More explict in:
https://msdn.microsoft.com/en-us/library/ms186939.aspx
*/
exports.nVarCharN = function(test) {
  return execSql(test, TYPES.NVarChar, 'qaz', null, { length: 4000 });
};

exports.nVarCharN_7_2_AndLater = function(test) {
  return execSql(test, TYPES.NVarChar, 'qaz', '7_2', { length: 4001 });
};

exports.nVarCharEmptyString = function(test) {
  return execSql(test, TYPES.NVarChar, '');
};

exports.nVarCharNull = function(test) {
  return execSql(test, TYPES.NVarChar, null);
};

exports.nVarCharMax = function(test) {
  var longString = '';
  for (
    var i = 1, end = 10 * 1000, asc = 1 <= end;
    asc ? i <= end : i >= end;
    asc ? i++ : i--
  ) {
    longString += 'x';
  }

  return execSql(test, TYPES.NVarChar, longString, '7_2');
};

exports.nVarCharMaxEmptyString = function(test) {
  return execSql(test, TYPES.NVarChar, '', null, { length: 4000 });
};

exports.nVarCharMaxEmptyString_7_2_AndLater = function(test) {
  return execSql(test, TYPES.NVarChar, '', '7_2', { length: 4001 });
};

exports.Char = function(test) {
  return execSql(test, TYPES.Char, 'qaz');
};

exports.CharN = function(test) {
  return execSql(test, TYPES.Char, 'qaz', null, { length: 3 });
};

exports.CharNull = function(test) {
  return execSql(test, TYPES.Char, null);
};

exports.NChar = function(test) {
  return execSql(test, TYPES.NChar, 'qaz');
};

exports.NCharN = function(test) {
  return execSql(test, TYPES.NChar, 'qaz', null, { length: 3 });
};

exports.NCharNull = function(test) {
  return execSql(test, TYPES.NChar, null);
};

exports.textNull = function(test) {
  return execSql(test, TYPES.Text, null);
};

exports.textEmpty = function(test) {
  return execSql(test, TYPES.Text, '');
};

exports.textSmall = function(test) {
  return execSql(test, TYPES.Text, 'small');
};

exports.textLarge = function(test) {
  var dBuf = new Buffer(500000);
  dBuf.fill('x');
  return execSql(test, TYPES.Text, dBuf.toString());
};

exports.smallDateTime = function(test) {
  return execSql(
    test,
    TYPES.SmallDateTime,
    new Date('December 4, 2011 10:04:00')
  );
};

exports.smallDateTimeNull = function(test) {
  return execSql(test, TYPES.SmallDateTime, null);
};

exports.dateTime = function(test) {
  return execSql(test, TYPES.DateTime, new Date('December 4, 2011 10:04:23'));
};

exports.dateTimeNull = function(test) {
  return execSql(test, TYPES.DateTime, null);
};

// The tests below validate DateTime precision on the input side, as described in
//  the section "Rounding of datetime Fractional Second Precision" from
// https://msdn.microsoft.com/en-us/library/ms187819.aspx

exports.dateTimePrecision_0 = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.990'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.990')
  );
};

exports.dateTimePrecision_1 = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.991'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.990')
  );
};

exports.dateTimePrecision_2 = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.992'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.993')
  );
};

exports.dateTimePrecision_3 = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.993'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.993')
  );
};

exports.dateTimePrecision_4 = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.994'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.993')
  );
};

exports.dateTimePrecision_5 = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.995'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.997')
  );
};

exports.dateTimePrecision_6 = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.996'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.997')
  );
};

exports.dateTimePrecision_7 = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.997'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.997')
  );
};

exports.dateTimePrecision_8 = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.998'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.997')
  );
};

exports.dateTimePrecision_9_sec_flip = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:58.999'),
    null,
    null,
    new Date('January 1, 1998 23:59:59.000')
  );
};

exports.dateTimePrecision_9_min_flip = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:58:59.999'),
    null,
    null,
    new Date('January 1, 1998 23:59:00.000')
  );
};

exports.dateTimePrecision_9_hr_flip = function(test) {
  return execSql(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 22:59:59.999'),
    null,
    null,
    new Date('January 1, 1998 23:00:00.000')
  );
};

// This test fails on the version of SQL Server in AppVeyor.
//exports.dateTimePrecision_9_day_flip = (test) ->
//  execSql(test, TYPES.DateTime, new Date('January 1, 1998 23:59:59.999'), null, null, new Date('January 2, 1998 00:00:00.000'))

exports.dateTime2 = function(test) {
  return execSql(
    test,
    TYPES.DateTime2,
    new Date('December 4, 2011 10:04:23'),
    '7_3_A'
  );
};

exports.dateTime2Null = function(test) {
  return execSql(test, TYPES.DateTime2, null, '7_3_A');
};

exports.outputBitTrue = function(test) {
  return execSqlOutput(test, TYPES.Bit, true);
};

exports.outputBitFalse = function(test) {
  return execSqlOutput(test, TYPES.Bit, false);
};

exports.outputBitNull = function(test) {
  return execSqlOutput(test, TYPES.Bit, null);
};

exports.outputTinyInt = function(test) {
  return execSqlOutput(test, TYPES.TinyInt, 3);
};

exports.outputTinyIntLarge = function(test) {
  return execSqlOutput(test, TYPES.TinyInt, 252);
};

exports.outputTinyIntNull = function(test) {
  return execSqlOutput(test, TYPES.TinyInt, null);
};

exports.outputSmallInt = function(test) {
  return execSqlOutput(test, TYPES.SmallInt, 3);
};

exports.outputSmallIntNull = function(test) {
  return execSqlOutput(test, TYPES.SmallInt, null);
};

exports.outputInt = function(test) {
  return execSqlOutput(test, TYPES.Int, 3);
};

exports.outputBigInt = function(test) {
  return execSqlOutput(test, TYPES.BigInt, 9007199254740991);
};

exports.outputBigInt1 = function(test) {
  return execSqlOutput(test, TYPES.BigInt, 1);
};

exports.outputBigIntSmall = function(test) {
  return execSqlOutput(test, TYPES.BigInt, -9007199254740991);
};

exports.outputBigIntSmall1 = function(test) {
  return execSqlOutput(test, TYPES.BigInt, -1);
};

exports.outputFloat = function(test) {
  return execSqlOutput(test, TYPES.Float, 9654.2546456567565767644);
};

exports.outputUniqueIdentifierN = function(test) {
  return execSqlOutput(
    test,
    TYPES.UniqueIdentifierN,
    '01234567-89AB-CDEF-0123-456789ABCDEF'
  );
};

exports.outputIntNull = function(test) {
  return execSqlOutput(test, TYPES.Int, null);
};

exports.outputVarChar = function(test) {
  return execSqlOutput(test, TYPES.VarChar, 'qwerty');
};

exports.outputVarCharNull = function(test) {
  return execSqlOutput(test, TYPES.VarChar, null);
};

exports.outputNVarChar = function(test) {
  return execSqlOutput(test, TYPES.NVarChar, 'qwerty');
};

exports.outputNVarCharNull = function(test) {
  return execSqlOutput(test, TYPES.NVarChar, null);
};

exports.outputSmallDateTime = function(test) {
  return execSqlOutput(
    test,
    TYPES.SmallDateTime,
    new Date('December 4, 2011 10:04:00')
  );
};

exports.outputSmallDateTimeNull = function(test) {
  return execSqlOutput(test, TYPES.SmallDateTime, null);
};

exports.outputDateTime = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('December 4, 2011 10:04:23')
  );
};

exports.outputDateTimeNull = function(test) {
  return execSqlOutput(test, TYPES.DateTime, null);
};

// The tests below validate DateTime precision on the output side, as described in
//  the section "Rounding of datetime Fractional Second Precision" from
// https://msdn.microsoft.com/en-us/library/ms187819.aspx

exports.outputDatePrecision_0 = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.990'),
    new Date('January 1, 1998 23:59:59.990')
  );
};

exports.outputDatePrecision_1 = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.991'),
    new Date('January 1, 1998 23:59:59.990')
  );
};

exports.outputDatePrecision_2 = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.992'),
    new Date('January 1, 1998 23:59:59.993')
  );
};

exports.outputDatePrecision_3 = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.993'),
    new Date('January 1, 1998 23:59:59.993')
  );
};

exports.outputDatePrecision_4 = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.994'),
    new Date('January 1, 1998 23:59:59.993')
  );
};

exports.outputDatePrecision_5 = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.995'),
    new Date('January 1, 1998 23:59:59.997')
  );
};

exports.outputDatePrecision_6 = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.996'),
    new Date('January 1, 1998 23:59:59.997')
  );
};

exports.outputDatePrecision_7 = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.997'),
    new Date('January 1, 1998 23:59:59.997')
  );
};

exports.outputDatePrecision_8 = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:59.998'),
    new Date('January 1, 1998 23:59:59.997')
  );
};

exports.outputDatePrecision_9_sec_flip = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:59:58.999'),
    new Date('January 1, 1998 23:59:59.000')
  );
};

exports.outputDatePrecision_9_min_flip = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 23:58:59.999'),
    new Date('January 1, 1998 23:59:00.000')
  );
};

exports.outputDatePrecision_9_hr_flip = function(test) {
  return execSqlOutput(
    test,
    TYPES.DateTime,
    new Date('January 1, 1998 22:59:59.999'),
    new Date('January 1, 1998 23:00:00.000')
  );
};

// This test fails on the version of SQL Server in AppVeyor.
//exports.outputDatePrecision_9_day_flip = (test) ->
//  execSqlOutput(test, TYPES.DateTime, new Date('January 1, 1998 23:59:59.999'), new Date('January 2, 1998 00:00:00.000'))

exports.multipleParameters = function(test) {
  test.expect(7);

  var config = getConfig();

  var request = new Request('select @param1, @param2', function(err) {
    test.ifError(err);

    return connection.close();
  });

  request.addParameter('param1', TYPES.Int, 3);
  request.addParameter('param2', TYPES.VarChar, 'qwerty');

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
    return test.strictEqual(rowCount, 1);
  });

  request.on('row', function(columns) {
    test.strictEqual(columns.length, 2);
    test.strictEqual(columns[0].value, 3);
    return test.strictEqual(columns[1].value, 'qwerty');
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.callProcedureWithParameters = function(test) {
  test.expect(13);

  var config = getConfig();

  var setupSql = `\
if exists (select * from sys.procedures where name = '__test5')
  exec('drop procedure [dbo].[__test5]')

exec('create procedure [dbo].[__test5]
  @in BINARY(4),
  @in2 BINARY(4) = NULL,
  @in3 VARBINARY(MAX),
  @in4 VARBINARY(MAX) = NULL,
  @in5 IMAGE,
  @in6 IMAGE = NULL,
  @out BINARY(4) = NULL OUTPUT,
  @out2 VARBINARY(MAX) = NULL OUTPUT
as
begin

  set nocount on

  select CAST( 123456 AS BINARY(4) ) as ''bin'', @in as ''in'', @in2 as ''in2'', @in3 as ''in3'', @in4 as ''in4'', @in5 as ''in5'', @in6 as ''in6''

  set @out = @in
  set @out2 = @in3

  return 0

end')\
`;

  var request = new Request(setupSql, function(err) {
    test.ifError(err);

    request = new Request('__test5', function(err) {
      test.ifError(err);

      return connection.close();
    });

    var sample = new Buffer([0x00, 0x01, 0xe2, 0x40]);

    request.addParameter('in', TYPES.Binary, sample);
    request.addParameter('in2', TYPES.Binary, null);
    request.addParameter('in3', TYPES.VarBinary, sample);
    request.addParameter('in4', TYPES.VarBinary, null);
    request.addParameter('in5', TYPES.Image, sample);
    request.addParameter('in6', TYPES.Image, null);
    request.addOutputParameter('out', TYPES.Binary, null, { length: 4 });
    request.addOutputParameter('out2', TYPES.VarBinary);

    request.on('doneInProc', function(rowCount, more) {
      test.strictEqual(rowCount, undefined);
      return test.ok(more);
    });

    request.on('row', function(columns) {
      test.strictEqual(columns.length, 7);
      test.deepEqual(columns[0].value, sample);
      test.deepEqual(columns[1].value, sample);
      test.strictEqual(columns[2].value, null);
      test.deepEqual(columns[3].value, sample);
      test.strictEqual(columns[4].value, null);
      test.deepEqual(columns[5].value, sample);
      return test.strictEqual(columns[6].value, null);
    });

    return connection.callProcedure(request);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.execSqlBatch(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

var execSql = function(test, type, value, tdsVersion, options, expectedValue) {
  var config = getConfig();
  //config.options.packetSize = 32768

  if (tdsVersion && tdsVersion > config.options.tdsVersion) {
    return test.done();
  }

  test.expect(6);

  var request = new Request('select @param', function(err) {
    test.ifError(err);

    return connection.close();
  });

  request.addParameter('param', type, value, options);

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
    return test.strictEqual(rowCount, 1);
  });

  request.on('row', function(columns) {
    test.strictEqual(columns.length, 1);

    if (!expectedValue) {
      expectedValue = value;
    }

    if (value instanceof Date) {
      return test.strictEqual(
        columns[0].value.getTime(),
        expectedValue.getTime()
      );
    } else if (type === TYPES.BigInt) {
      return test.strictEqual(columns[0].value, expectedValue.toString());
    } else if (type === TYPES.UniqueIdentifierN) {
      return test.deepEqual(columns[0].value, expectedValue);
    } else {
      return test.strictEqual(columns[0].value, expectedValue);
    }
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on('errorMessage', function(error) {
    return console.log(`${error.number} : ${error.message}`);
  });

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

var execSqlOutput = function(test, type, value, expectedValue) {
  test.expect(7);

  var config = getConfig();

  var request = new Request('set @paramOut = @paramIn', function(err) {
    test.ifError(err);

    return connection.close();
  });

  request.addParameter('paramIn', type, value);
  request.addOutputParameter('paramOut', type);

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
    return test.strictEqual(rowCount, 1);
  });

  request.on('returnValue', function(name, returnValue, metadata) {
    test.strictEqual(name, 'paramOut');

    if (!expectedValue) {
      expectedValue = value;
    }

    if (value instanceof Date) {
      test.strictEqual(returnValue.getTime(), expectedValue.getTime());
    } else if (type === TYPES.BigInt) {
      test.strictEqual(returnValue, expectedValue.toString());
    } else if (type === TYPES.UniqueIdentifierN) {
      test.deepEqual(returnValue, expectedValue);
    } else {
      test.strictEqual(returnValue, expectedValue);
    }

    return test.ok(metadata);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  return connection.on(
    'debug',
    function(text) {}
    // console.log(text)
  );
};
