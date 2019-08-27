const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/tedious').TYPES;
const fs = require('fs');
const async = require('async');

const { assert } = require('chai');

function getConfig() {
  var config = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  ).config;

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true
  };

  return config;
}

describe('calling a procedure that takes and returns a TVP', function() {
  this.timeout(5000);

  let connection;

  beforeEach(function(done) {
    const config = getConfig();

    if (config.options.tdsVersion < '7_3_A') {
      this.skip();
    }

    connection = new Connection(config);

    connection.on(
      'infoMessage',
      function(info) {}
      // console.log("#{info.number} : #{info.message}")
    );

    connection.on(
      'debug',
      function(text) {}
      // console.log(text)
    );

    connection.on('connect', done);
  });

  afterEach(function() {
    connection.close();
  });

  it('returns the same data', function(done) {
    async.series([
      (next) => {
        const sql = 'USE tempdb; BEGIN TRY DROP TYPE TediousTestType END TRY BEGIN CATCH END CATCH';
        connection.execSqlBatch(new Request(sql, next));
      },
      (next) => {
        const sql = 'USE tempdb; CREATE TYPE TediousTestType AS TABLE (a bit, b tinyint, c smallint, d int, e bigint, f real, g float, h varchar (100), i nvarchar (100), j datetime)';
        connection.execSqlBatch(new Request(sql, next));
      },
      (next) => {
        const sql = 'CREATE PROCEDURE #__tediousTvpTest @tvp TediousTestType readonly AS BEGIN select * from @tvp END';
        connection.execSqlBatch(new Request(sql, next));
      }
    ], (err) => {
      if (err) {
        console.log(err.message);
        return done();
      }

      var request4 = new Request('#__tediousTvpTest', done);

      request4.on('doneInProc', function(rowCount, more) {
        assert.strictEqual(rowCount, 1);
      });

      request4.on('row', function(columns) {
        assert.strictEqual(columns[0].value, false);
        assert.strictEqual(columns[1].value, 1);
        assert.strictEqual(columns[2].value, 2);
        assert.strictEqual(columns[3].value, 3);
        assert.strictEqual(columns[4].value, '4');
        assert.strictEqual(columns[5].value, 5.5);
        assert.strictEqual(columns[6].value, 6.6);
        assert.strictEqual(columns[7].value, 'asdf');
        assert.strictEqual(columns[8].value, 'asdf');
        assert.strictEqual(+columns[9].value, +new Date(Date.UTC(2014, 0, 1)));
      });

      var table = {
        columns: [
          {
            name: 'a',
            type: TYPES.Bit
          },
          {
            name: 'b',
            type: TYPES.TinyInt
          },
          {
            name: 'c',
            type: TYPES.SmallInt
          },
          {
            name: 'd',
            type: TYPES.Int
          },
          {
            name: 'e',
            type: TYPES.BigInt
          },
          {
            name: 'f',
            type: TYPES.Real
          },
          {
            name: 'g',
            type: TYPES.Float
          },
          {
            name: 'h',
            type: TYPES.VarChar,
            length: 100
          },
          {
            name: 'i',
            type: TYPES.NVarChar,
            length: 100
          },
          {
            name: 'j',
            type: TYPES.DateTime,
            length: 100
          }
        ],
        rows: [
          [
            false,
            1,
            2,
            3,
            4,
            5.5,
            6.6,
            'asdf',
            'asdf',
            new Date(Date.UTC(2014, 0, 1))
          ]
        ]
      };

      request4.addParameter('tvp', TYPES.TVP, table, {});

      connection.callProcedure(request4);
    });
  });
});
