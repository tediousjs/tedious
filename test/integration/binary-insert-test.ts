import { assert } from 'chai';
import { typeByName as TYPES } from '../../src/data-type';
import Connection from '../../src/connection';
import Request from '../../src/request';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';
import defaultConfig from '../config';

describe('inserting binary data', function() {
  let connection: Connection;

  beforeEach(function(done) {
    const config = {
      ...defaultConfig,
      options: {
        ...defaultConfig.options,
        debug: debugOptionsFromEnv(),
        tdsVersion: process.env.TEDIOUS_TDS_VERSION,
      }
    };

    connection = new Connection(config);
    connection.connect(done);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  afterEach(function(done) {
    if (!connection.closed) {
      connection.on('end', done);
      connection.close();
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

        const values: unknown[] = [];

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

        connection.execSql(request);
      });

      request.addParameter('p1', TYPES.Binary, Buffer.from([0x12, 0x34, 0x00, 0xce]));
      connection.execSql(request);
    });

    connection.execSqlBatch(request);
  });
});
