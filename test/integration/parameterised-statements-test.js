const Connection = require('../../src/connection');
const Request = require('../../src/request');
const fs = require('fs');
const TYPES = require('../../src/data-type').typeByName;
const assert = require('chai').assert;

function getConfig() {
  const config = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  ).config;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true,
  };

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  return config;
}


function execSql(done, type, value, tdsVersion, options, expectedValue, cast, connectionOptions) {
  var config = getConfig();
  // config.options.packetSize = 32768

  if (tdsVersion && tdsVersion > config.options.tdsVersion) {
    done();
    return;
  }

  var request = new Request(cast ? 'select CAST(@param as varchar(max))' : 'select @param', function(err) {
    assert.ifError(err);

    connection.close();
  });

  request.addParameter('param', type, value, options);

  request.on('doneInProc', function(rowCount, more) {
    assert.ok(more);
    assert.strictEqual(rowCount, 1);
  });

  request.on('row', function(columns) {
    assert.strictEqual(columns.length, 1);

    if (!expectedValue) {
      expectedValue = value;
    }

    if (expectedValue === null) {
      assert.isNull(columns[0].value);
    } else if (cast) {
      assert.strictEqual(columns[0].value, expectedValue);
    } else if (expectedValue instanceof Date) {
      assert.strictEqual(columns[0].value.getTime(), expectedValue.getTime());
    } else if (type === TYPES.BigInt) {
      assert.strictEqual(columns[0].value, expectedValue.toString());
    } else if (type === TYPES.UniqueIdentifier) {
      assert.deepEqual(columns[0].value, expectedValue);
    } else {
      assert.strictEqual(columns[0].value, expectedValue);
    }
  });

  const connectionConfig = Object.assign({}, config, { options: Object.assign({}, config.options, connectionOptions) });
  var connection = new Connection(connectionConfig);

  connection.on('connect', function(err) {
    assert.ifError(err);
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    done();
  });

  connection.on('errorMessage', function(error) {
    console.log(`${error.number} : ${error.message}`);
  });

  connection.on('debug', function(text) {
    // console.log(text)
  });
}

function execSqlOutput(done, type, value, expectedValue, connectionOptions) {
  var config = getConfig();

  var request = new Request('set @paramOut = @paramIn', function(err) {
    assert.ifError(err);

    connection.close();
  });

  request.addParameter('paramIn', type, value);
  request.addOutputParameter('paramOut', type);

  request.on('doneInProc', function(rowCount, more) {
    assert.ok(more);
    assert.strictEqual(rowCount, 1);
  });

  request.on('returnValue', function(name, returnValue, metadata) {
    assert.strictEqual(name, 'paramOut');

    if (!expectedValue) {
      expectedValue = value;
    }

    if (value instanceof Date) {
      assert.strictEqual(returnValue.getTime(), expectedValue.getTime());
    } else if (type === TYPES.BigInt) {
      assert.strictEqual(returnValue, expectedValue.toString());
    } else if (type === TYPES.UniqueIdentifier) {
      assert.deepEqual(returnValue, expectedValue);
    } else {
      assert.strictEqual(returnValue, expectedValue);
    }

    assert.ok(metadata);
  });

  const connectionConfig = Object.assign({}, config, { options: Object.assign({}, config.options, connectionOptions) });
  var connection = new Connection(connectionConfig);

  connection.on('connect', function(err) {
    assert.ifError(err);
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    done();
  });

  connection.on('debug', function(text) {
    // console.log(text)
  });
}

describe('Parameterised Statements Test', function() {
  this.timeout(60000);

  it('should test bit True', function(done) {
    execSql(done, TYPES.Bit, true);
  });

  it('should test bit False', function(done) {
    execSql(done, TYPES.Bit, false);
  });

  it('should test bit null', function(done) {
    execSql(done, TYPES.Bit, null);
  });

  it('should test tiny int', function(done) {
    execSql(done, TYPES.TinyInt, 8);
  });

  it('should test tiny int zero', function(done) {
    execSql(done, TYPES.TinyInt, 0);
  });

  it('should test tiny int large', function(done) {
    execSql(done, TYPES.TinyInt, 252);
  });

  it('should test tiny int null', function(done) {
    execSql(done, TYPES.TinyInt, null);
  });

  it('should test small int', function(done) {
    execSql(done, TYPES.SmallInt, 8);
  });

  it('should test small int zero', function(done) {
    execSql(done, TYPES.SmallInt, 0);
  });

  it('should test small int null', function(done) {
    execSql(done, TYPES.SmallInt, null);
  });

  it('should test in', function(done) {
    execSql(done, TYPES.Int, 8);
  });

  it('should test big int', function(done) {
    execSql(done, TYPES.BigInt, 9007199254740991);
  });

  it('should test biging1', function(done) {
    execSql(done, TYPES.BigInt, 1);
  });

  it('should test big int small', function(done) {
    execSql(done, TYPES.BigInt, -9007199254740991);
  });

  it('should test big int small1', function(done) {
    execSql(done, TYPES.BigInt, -1);
  });

  it('should test real', function(done) {
    execSql(done, TYPES.Real, 9654.2529296875);
  });

  it('should test float', function(done) {
    execSql(done, TYPES.Float, 9654.2546456567565767644);
  });

  it('should test numeric', function(done) {
    execSql(done, TYPES.Numeric, 5555);
  });

  it('should test numeric large value', function(done) {
    execSql(done, TYPES.Numeric, 5.555555555555553333, null, {
      precision: 19,
      scale: 18,
    });
  });

  it('should test numeric negative', function(done) {
    execSql(done, TYPES.Numeric, -5555.55, null, {
      precision: 6,
      scale: 2,
    });
  });

  it('should test decimal', function(done) {
    execSql(done, TYPES.Decimal, 5555);
  });

  it('should test decimal large value', function(done) {
    execSql(done, TYPES.Decimal, 5.555555555555553333, null, {
      precision: 19,
      scale: 18,
    });
  });

  it('should test decimal negative', function(done) {
    execSql(done, TYPES.Decimal, -5555.55, null, {
      precision: 6,
      scale: 2,
    });
  });

  it('should test small money', function(done) {
    execSql(done, TYPES.SmallMoney, 9842.4566);
  });

  it('should test money', function(done) {
    execSql(done, TYPES.Money, 956455842.4566);
  });

  it('UniqueIdentifier when `lowerCaseGuids` option is `false`', function(done) {
    execSql(
      done,
      TYPES.UniqueIdentifier,
      '01234567-89AB-CDEF-0123-456789ABCDEF',
      undefined,
      undefined,
      undefined,
      undefined,
      { lowerCaseGuids: false }
    );
  });

  it('UniqueIdentifier when `lowerCaseGuids` option is `true`', function(done) {
    execSql(
      done,
      TYPES.UniqueIdentifier,
      '01234567-89ab-cdef-0123-456789abcdef',
      undefined,
      undefined,
      undefined,
      undefined,
      { lowerCaseGuids: true }
    );
  });

  it('should test int zero', function(done) {
    execSql(done, TYPES.Int, 0);
  });

  it('should test int null', function(done) {
    execSql(done, TYPES.Int, null);
  });

  it('should test var char', function(done) {
    execSql(done, TYPES.VarChar, 'qaz');
  });

  /* Per 2.2.5.4.3, lengths greater than 8000 only supported version 7.2 and beyond. */
  it('should test var char N', function(done) {
    execSql(done, TYPES.VarChar, 'qaz', null, { length: 8000 });
  });

  it('should test var char N_7_2 and later', function(done) {
    execSql(done, TYPES.VarChar, 'qaz', '7_2', { length: 8001 });
  });

  it('should test var char empty string', function(done) {
    execSql(done, TYPES.VarChar, '');
  });

  it('should test var char null', function(done) {
    execSql(done, TYPES.VarChar, null);
  });

  it('should test varchar max', function(done) {
    var longString = '';
    for (
      var i = 1, end = 10 * 1000, asc = 1 <= end;
      asc ? i <= end : i >= end;
      asc ? i++ : i--
    ) {
      longString += 'x';
    }

    execSql(done, TYPES.VarChar, longString, '7_2');
  });

  it('should test varchar max empty string', function(done) {
    execSql(done, TYPES.VarChar, '', null, { length: 8000 });
  });

  it('should test varchar max empty string 7_2 and later', function(done) {
    execSql(done, TYPES.VarChar, '', '7_2', { length: 8001 });
  });

  it('should test nvarchar', function(done) {
    execSql(done, TYPES.NVarChar, 'qaz');
  });

  /*
  Per 2.2.5.4.3, lengths greater than 8000 only supported version 7.2 and
  beyond. Since NVarChar is unicode, that'd be 4000. More explict in:
  https://msdn.microsoft.com/en-us/library/ms186939.aspx
  */
  it('should test nvarcharN', function(done) {
    execSql(done, TYPES.NVarChar, 'qaz', null, { length: 4000 });
  });

  it('should test nvarcharN 7_2 and later', function(done) {
    execSql(done, TYPES.NVarChar, 'qaz', '7_2', { length: 4001 });
  });

  it('should test nvarchar empty string', function(done) {
    execSql(done, TYPES.NVarChar, '');
  });

  it('should test nvarchar null', function(done) {
    execSql(done, TYPES.NVarChar, null);
  });

  it('should test nvarchar max', function(done) {
    var longString = '';
    for (
      var i = 1, end = 10 * 1000, asc = 1 <= end;
      asc ? i <= end : i >= end;
      asc ? i++ : i--
    ) {
      longString += 'x';
    }

    execSql(done, TYPES.NVarChar, longString, '7_2');
  });

  it('should test nvarchar max emtpy string', function(done) {
    execSql(done, TYPES.NVarChar, '', null, { length: 4000 });
  });

  it('should test nvarchar max empty string 7_2 and later', function(done) {
    execSql(done, TYPES.NVarChar, '', '7_2', { length: 4001 });
  });

  it('should test char', function(done) {
    execSql(done, TYPES.Char, 'qaz');
  });

  it('should test charN', function(done) {
    execSql(done, TYPES.Char, 'qaz', null, { length: 3 });
  });

  it('should test charNull', function(done) {
    execSql(done, TYPES.Char, null);
  });

  it('should test NChar', function(done) {
    execSql(done, TYPES.NChar, 'qaz');
  });

  it('should test NCharN', function(done) {
    execSql(done, TYPES.NChar, 'qaz', null, { length: 3 });
  });

  it('should test NCharNull', function(done) {
    execSql(done, TYPES.NChar, null);
  });

  it('should test textNull', function(done) {
    execSql(done, TYPES.Text, null);
  });

  it('should test textEmtpy', function(done) {
    execSql(done, TYPES.Text, '');
  });

  it('should test text small', function(done) {
    execSql(done, TYPES.Text, 'small');
  });

  it('should test text large', function(done) {
    var dBuf = Buffer.alloc(500000);
    dBuf.fill('x');
    execSql(done, TYPES.Text, dBuf.toString());
  });

  describe('´time´', function() {
    it('should handle `null` values', function(done) {
      execSql(done, TYPES.Time, null, '7_3', null);
    });

    it('ignores the date part of given `Date` values', function(done) {
      execSql(done, TYPES.Time, new Date('2000-02-19T12:34:56Z'), '7_3', null, new Date('1970-01-01T12:34:56Z'));
    });

    it('should handle `string` values', function(done) {
      execSql(done, TYPES.Time, '1970-01-01T12:34:56Z', '7_3', null, '12:34:56.0000000', true);
    });

    const testTime = Object.assign(new Date('1970-01-01T00:00:00Z'), { nanosecondDelta: 0.1111111 });

    it('should test time', function(done) {
      execSql(done, TYPES.Time, testTime, '7_3', null, '00:00:00.1111111', true);
    });

    it('should test time1', function(done) {
      execSql(done, TYPES.Time, testTime, '7_3', { scale: 1 }, '00:00:00.1', true);
    });

    it('should test time2', function(done) {
      execSql(done, TYPES.Time, testTime, '7_3', { scale: 2 }, '00:00:00.11', true);
    });

    it('should test time3', function(done) {
      execSql(done, TYPES.Time, testTime, '7_3', { scale: 3 }, '00:00:00.111', true);
    });

    it('should test time4', function(done) {
      execSql(done, TYPES.Time, testTime, '7_3', { scale: 4 }, '00:00:00.1111', true);
    });

    it('should test time5', function(done) {
      execSql(done, TYPES.Time, testTime, '7_3', { scale: 5 }, '00:00:00.11111', true);
    });

    it('should test time 6', function(done) {
      execSql(done, TYPES.Time, testTime, '7_3', { scale: 6 }, '00:00:00.111111', true);
    });

    it('should test time7', function(done) {
      execSql(done, TYPES.Time, testTime, '7_3', { scale: 7 }, '00:00:00.1111111', true);
    });
  });

  describe('`smalldatetime`', function() {
    it('should handle `Date` values', function(done) {
      execSql(
        done,
        TYPES.SmallDateTime,
        new Date('December 4, 2011 10:04:00')
      );
    });

    it('should handle `null` values', function(done) {
      execSql(done, TYPES.SmallDateTime, null);
    });

    it('should handle `string` values', function(done) {
      execSql(done, TYPES.SmallDateTime, '2015-10-31 00:00:00', undefined, undefined, new Date('2015-10-31 00:00:00'));
    });
  });

  describe('`datetime`', function() {
    it('should handle `Date` values', function(done) {
      execSql(done, TYPES.DateTime, new Date('December 4, 2011 10:04:23'));
    });

    it('should handle `null` values', function(done) {
      execSql(done, TYPES.DateTime, null);
    });

    it('should handle `string` values', function(done) {
      execSql(done, TYPES.DateTime, '2015-10-31 00:00:00', undefined, undefined, new Date('2015-10-31 00:00:00'));
    });

    // The tests below validate DateTime precision on the input side, as described in
    //  the section "Rounding of datetime Fractional Second Precision" from
    // https://msdn.microsoft.com/en-us/library/ms187819.aspx
    it('should test date time precision_0', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.990'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.990')
      );
    });

    it('should test date time precision_1', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.991'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.990')
      );
    });

    it('should test date time precision_2', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.992'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.993')
      );
    });

    it('should test date time precision_3', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.993'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.993')
      );
    });

    it('should test date time precision_4', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.994'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.993')
      );
    });

    it('should test date time precision_5', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.995'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.997')
      );
    });

    it('should test date time precision_6', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.996'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.997')
      );
    });

    it('should test date time precision_7', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.997'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.997')
      );
    });

    it('should test date time precison_8', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.998'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.997')
      );
    });

    it('should test date time precision_9 sec flip', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:58.999'),
        null,
        null,
        new Date('January 1, 1998 23:59:59.000')
      );
    });

    it('should test date time precision_9 min flip', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:58:59.999'),
        null,
        null,
        new Date('January 1, 1998 23:59:00.000')
      );
    });

    it('should test date time precision_9 hr flip', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 22:59:59.999'),
        null,
        null,
        new Date('January 1, 1998 23:00:00.000')
      );
    });

    it('should test date time precision_9 hr flip', function(done) {
      execSql(
        done,
        TYPES.DateTime,
        new Date('January 1, 1998 23:59:59.999'),
        null,
        null,
        new Date('January 2, 1998 00:00:00.000')
      );
    });
  });

  describe('`datetime2`', function() {
    it('should handle `Date` values', function(done) {
      execSql(
        done,
        TYPES.DateTime2,
        new Date('December 4, 2011 10:04:23'),
        '7_3_A'
      );
    });

    it('should handle `null` values', function(done) {
      execSql(done, TYPES.DateTime2, null, '7_3_A');
    });

    it('should correctly handle `Date` values with high precision', function(done) {
      const value = new Date(2019, 11, 19, 23, 59, 59, 997);
      execSql(done, TYPES.DateTime2, value, '7_3_A', undefined, '2019-12-19 23:59:59.9970000', true, { useUTC: false });
    });

    it('should correctly handle `Date` values with high precision', function(done) {
      const value = new Date(2019, 11, 19, 23, 59, 59, 997);
      execSql(done, TYPES.DateTime2, value, '7_3_A', undefined, undefined, undefined, { useUTC: false });
    });

    it('should correctly handle `Date` values with high precision', function(done) {
      const value = new Date(2019, 11, 19, 23, 59, 59, 998);
      execSql(done, TYPES.DateTime2, value, '7_3_A', undefined, '2019-12-19 23:59:59.9980000', true, { useUTC: false });
    });

    it('should correctly handle `Date` values with high precision', function(done) {
      const value = new Date(2019, 11, 19, 23, 59, 59, 998);
      execSql(done, TYPES.DateTime2, value, '7_3_A', undefined, undefined, undefined, { useUTC: false });
    });

    it('should handle `string` values', function(done) {
      execSql(
        done,
        TYPES.DateTime2,
        'December 4, 2011 10:04:23',
        '7_3_A',
        null,
        new Date('December 4, 2011 10:04:23')
      );
    });
  });

  describe('`datetimeoffset`', function() {
    it('should handle `Date` values', function(done) {
      execSql(
        done,
        TYPES.DateTimeOffset,
        new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)),
        '7_3_A'
      );
    });

    it('should handle `null` values', function(done) {
      execSql(done, TYPES.DateTimeOffset, null, '7_3_A');
    });

    it('should handle `string` values', function(done) {
      execSql(
        done,
        TYPES.DateTimeOffset,
        'December 4, 2011 10:04:23',
        '7_3_A',
        null,
        new Date('December 4, 2011 10:04:23')
      );
    });
  });

  it('should test output bit true', function(done) {
    execSqlOutput(done, TYPES.Bit, true);
  });

  it('should test output bit false', function(done) {
    execSqlOutput(done, TYPES.Bit, false);
  });

  it('should test ouput bit null', function(done) {
    execSqlOutput(done, TYPES.Bit, null);
  });

  it('should test output tiny int', function(done) {
    execSqlOutput(done, TYPES.TinyInt, 3);
  });

  it('should test output tiny int large', function(done) {
    execSqlOutput(done, TYPES.TinyInt, 252);
  });

  it('should test output tiny int null', function(done) {
    execSqlOutput(done, TYPES.TinyInt, null);
  });

  it('should test output small int', function(done) {
    execSqlOutput(done, TYPES.SmallInt, 3);
  });

  it('should test output small int null', function(done) {
    execSqlOutput(done, TYPES.SmallInt, null);
  });

  it('should test output int', function(done) {
    execSqlOutput(done, TYPES.Int, 3);
  });

  it('should test output big int', function(done) {
    execSqlOutput(done, TYPES.BigInt, 9007199254740991);
  });

  it('should test output big int 1', function(done) {
    execSqlOutput(done, TYPES.BigInt, 1);
  });

  it('should test output big int small', function(done) {
    execSqlOutput(done, TYPES.BigInt, -9007199254740991);
  });

  it('should test output big int small 1', function(done) {
    execSqlOutput(done, TYPES.BigInt, -1);
  });


  it('should test output float', function(done) {
    execSqlOutput(done, TYPES.Float, 9654.2546456567565767644);
  });

  it('UniqueIdentifier as output parameter when `lowerCaseGuids` option is `false`', function(done) {
    execSqlOutput(done, TYPES.UniqueIdentifier, '01234567-89AB-CDEF-0123-456789ABCDEF', undefined, { lowerCaseGuids: false });
  });

  it('UniqueIdentifier as output parameter when `lowerCaseGuids` option is `true`', function(done) {
    execSqlOutput(done, TYPES.UniqueIdentifier, '01234567-89ab-cdef-0123-456789abcdef', undefined, { lowerCaseGuids: true });
  });

  it('should output int null', function(done) {
    execSqlOutput(done, TYPES.Int, null);
  });

  it('should output varchar', function(done) {
    execSqlOutput(done, TYPES.VarChar, 'qwerty');
  });

  it('should output var char null', function(done) {
    execSqlOutput(done, TYPES.VarChar, null);
  });

  it('should output NVarChar', function(done) {
    execSqlOutput(done, TYPES.NVarChar, 'qwerty');
  });

  it('should output NVarChar null', function(done) {
    execSqlOutput(done, TYPES.NVarChar, null);
  });

  it('should output small date time', function(done) {
    execSqlOutput(
      done,
      TYPES.SmallDateTime,
      new Date('December 4, 2011 10:04:00')
    );
  });

  it('should output small date time null', function(done) {
    execSqlOutput(done, TYPES.SmallDateTime, null);
  });

  it('should output date time', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('December 4, 2011 10:04:23')
    );
  });

  it('should output date time null', function(done) {
    execSqlOutput(done, TYPES.DateTime, null);
  });

  // The tests below validate DateTime precision on the output side, as described in
  //  the section "Rounding of datetime Fractional Second Precision" from
  // https://msdn.microsoft.com/en-us/library/ms187819.aspx
  it('should output date precision_0', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:59.990'),
      new Date('January 1, 1998 23:59:59.990')
    );
  });

  it('should output date precision_1', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:59.991'),
      new Date('January 1, 1998 23:59:59.990')
    );
  });

  it('should output date precision_2', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:59.992'),
      new Date('January 1, 1998 23:59:59.993')
    );
  });

  it('should output date precision_3', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:59.993'),
      new Date('January 1, 1998 23:59:59.993')
    );
  });

  it('should output date precision_4', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:59.994'),
      new Date('January 1, 1998 23:59:59.993')
    );
  });

  it('should output date precision_5', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:59.995'),
      new Date('January 1, 1998 23:59:59.997')
    );
  });

  it('should output date precision_6', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:59.996'),
      new Date('January 1, 1998 23:59:59.997')
    );
  });

  it('should output date precision_7', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:59.997'),
      new Date('January 1, 1998 23:59:59.997')
    );
  });

  it('should test output date precision_8', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:59.998'),
      new Date('January 1, 1998 23:59:59.997')
    );
  });

  it('should output date precision_9_sec_flip', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:59:58.999'),
      new Date('January 1, 1998 23:59:59.000')
    );
  });

  it('should output date precision_9_min_flip', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 23:58:59.999'),
      new Date('January 1, 1998 23:59:00.000')
    );
  });

  it('should output date precision_9_hr_flip', function(done) {
    execSqlOutput(
      done,
      TYPES.DateTime,
      new Date('January 1, 1998 22:59:59.999'),
      new Date('January 1, 1998 23:00:00.000')
    );
  });

  // This test fails on the version of SQL Server in AppVeyor.
  // exports.outputDatePrecision_9_day_flip = (test) ->
  //  execSqlOutput(test, TYPES.DateTime, new Date('January 1, 1998 23:59:59.999'), new Date('January 2, 1998 00:00:00.000'))
  it('should test multiple parameters', function(done) {
    var config = getConfig();

    var request = new Request('select @param1, @param2', function(err) {
      assert.ifError(err);

      connection.close();
    });

    request.addParameter('param1', TYPES.Int, 3);
    request.addParameter('param2', TYPES.VarChar, 'qwerty');

    request.on('doneInProc', function(rowCount, more) {
      assert.ok(more);
      assert.strictEqual(rowCount, 1);
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns.length, 2);
      assert.strictEqual(columns[0].value, 3);
      assert.strictEqual(columns[1].value, 'qwerty');
    });

    var connection = new Connection(config);

    connection.on('connect', function(err) {
      assert.ifError(err);
      connection.execSql(request);
    });

    connection.on('end', function(info) {
      done();
    });

    connection.on('debug', function(text) {
      // console.log(text)
    });
  });

  it('should call procedure with parameters', function(done) {
    var config = getConfig();

    var setupSql = `\
exec('create procedure #__test5
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
      assert.ifError(err);

      request = new Request('#__test5', function(err) {
        assert.ifError(err);

        connection.close();
      });

      var sample = Buffer.from([0x00, 0x01, 0xe2, 0x40]);

      request.addParameter('in', TYPES.Binary, sample);
      request.addParameter('in2', TYPES.Binary, null);
      request.addParameter('in3', TYPES.VarBinary, sample);
      request.addParameter('in4', TYPES.VarBinary, null);
      request.addParameter('in5', TYPES.Image, sample);
      request.addParameter('in6', TYPES.Image, null);
      request.addOutputParameter('out', TYPES.Binary, null, { length: 4 });
      request.addOutputParameter('out2', TYPES.VarBinary);

      request.on('doneInProc', function(rowCount, more) {
        assert.strictEqual(rowCount, undefined);
        assert.ok(more);
      });

      request.on('row', function(columns) {
        assert.strictEqual(columns.length, 7);
        assert.deepEqual(columns[0].value, sample);
        assert.deepEqual(columns[1].value, sample);
        assert.strictEqual(columns[2].value, null);
        assert.deepEqual(columns[3].value, sample);
        assert.strictEqual(columns[4].value, null);
        assert.deepEqual(columns[5].value, sample);
        assert.strictEqual(columns[6].value, null);
      });

      connection.callProcedure(request);
    });

    var connection = new Connection(config);

    connection.on('connect', function(err) {
      assert.ifError(err);
      connection.execSqlBatch(request);
    });

    connection.on('end', function(info) {
      done();
    });

    connection.on('debug', function(text) {
      // console.log(text)
    });
  });

});
