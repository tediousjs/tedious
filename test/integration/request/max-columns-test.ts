import fs from 'fs';
import { homedir } from 'os';

import Connection from '../../../src/connection';
import Request from '../../../src/request';

const config = JSON.parse(
  fs.readFileSync(homedir() + '/.tedious/test-connection.json', 'utf8')
).config;
config.options.textsize = 8 * 1024;

const debug = false;
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

describe('Request', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(config);

    connection.on('errorMessage', function(error) {
      console.log(`${error.number} : ${error.message}`);
    });

    if (debug) {
      connection.on('debug', function(message) {
        console.log(message);
      });
    }

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

  it('should succesfully allow selecting all columns from a table with the maximum number of columns', function(done) {
    const columnDefintions = [];
    for (let i = 0; i < 1024; i++) {
      columnDefintions.push('[' + i + '] binary(4)');
    }

    const createTableSql = 'CREATE TABLE #temp (' + columnDefintions.join(', ') + ')';

    const request = new Request(createTableSql, (err) => {
      if (err) {
        return done(err);
      }

      const request = new Request('SELECT * FROM #temp', (err) => {
        if (err) {
          return done(err);
        }

        const sql = 'INSERT INTO #temp VALUES ' +
          '(' + (new Array(1024).fill('0x1234').join(', ')) + '), ' +
          // The below row data is set to trigger a NBC Row Token (decided by the SQL Server that may be subject to possible change without notice)
          '(' + (new Array(64 + 32).fill('NULL').join(', ')) + ', ' + (new Array(512 + 256 + 128 + 32).fill('0x1234').join(', ')) + ')';

        const request = new Request(sql, (err) => {
          if (err) {
            return done(err);
          }

          const request = new Request('SELECT * FROM #temp', done);
          connection.execSql(request);
        });

        connection.execSql(request);
      });

      connection.execSql(request);
    });

    connection.execSqlBatch(request);
  });
});
