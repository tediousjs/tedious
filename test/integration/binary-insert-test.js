const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;

const fs = require('fs');
const { assert } = require('chai');

const config = JSON.parse(
  fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
).config;

config.options.debug = {
  packet: true,
  data: true,
  payload: true,
  token: true,
  log: true
};

config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

describe('inserting binary data', function() {
  this.timeout(60000);

  beforeEach(function(done) {
    this.connection = new Connection(config);
    this.connection.on('connect', done);
  });

  afterEach(function(done) {
    if (!this.connection.closed) {
      this.connection.on('end', done);
      this.connection.close();
    } else {
      done();
    }
  });

  it('should correctly insert the binary data', function(done) {
    const request = new Request('CREATE TABLE #test ([data] binary(4))', (err) => {
      if (err) {
        return done(err);
      }

      const request = new Request('INSERT INTO #test ([data]) VALUES (@p1)', (err) => {
        if (err) {
          return done(err);
        }

        const values = [];
        const request = new Request('SELECT [data] FROM #test', (err) => {
          if (err) {
            return done(err);
          }

          assert.deepEqual(values, [Buffer.from([0x12, 0x34, 0x00, 0xce])]);

          done();
        });

        request.on('row', function(columns) {
          values.push(columns[0].value);
        });

        this.connection.execSql(request);
      });

      request.addParameter('p1', TYPES.Binary, Buffer.from([0x12, 0x34, 0x00, 0xce]));
      this.connection.execSql(request);
    });

    this.connection.execSqlBatch(request);
  });
});
