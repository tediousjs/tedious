import { assert } from 'chai';
import { randomBytes } from 'crypto';

import { TYPES } from '../../src/tedious';
import Connection from '../../src/connection';
import Request from '../../src/request';
import { InputError } from '../../src/errors';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  return {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION
    }
  };
}

/**
 * Splits `value` into chunks of uneven sizes, including an empty one, so
 * that chunk boundaries do not line up with any framing boundary.
 */
async function * chunked<T extends Buffer | string>(value: T, sizes: number[]): AsyncIterable<T> {
  let offset = 0;
  for (let i = 0; offset < value.length; i = (i + 1) % sizes.length) {
    const chunk = value.slice(offset, offset + sizes[i]) as T;
    offset += sizes[i];
    yield chunk;
  }
}

describe('streaming parameters', function() {
  let config: ReturnType<typeof getConfig>;
  let connection: Connection;

  beforeEach(function(done) {
    config = getConfig();

    connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.connect(done);
  });

  afterEach(function() {
    connection.close();
  });

  beforeEach(function() {
    // `max` types, and with them PLP, exist from TDS 7.2 on.
    if (config.options.tdsVersion! < '7_2') {
      this.skip();
    }
  });

  function selectParameter(type: typeof TYPES[keyof typeof TYPES], value: unknown, callback: (err: Error | null | undefined, result?: unknown) => void) {
    let result: unknown;

    const request = new Request('select @param', (err) => {
      callback(err, result);
    });
    request.addParameter('param', type, value);
    request.on('row', (columns) => {
      result = columns[0].value;
    });

    connection.execSql(request);
  }

  it('streams a varbinary(max) value from an async iterable', function(done) {
    // Larger than a packet and than the serialization flush size, so the
    // value is sent as several PLP chunks over several packets.
    const value = randomBytes(100_000);

    selectParameter(TYPES.VarBinary, chunked(value, [1, 0, 4_097, 20_000, 3]), (err, result) => {
      if (err) {
        return done(err);
      }

      assert.instanceOf(result, Buffer);
      assert.strictEqual(Buffer.compare(result as Buffer, value), 0);
      done();
    });
  });

  it('streams an nvarchar(max) value from an async iterable', function(done) {
    const value = 'streamed \u{1F600} '.repeat(5_000);

    selectParameter(TYPES.NVarChar, chunked(value, [1, 7, 0, 4_099, 30_000]), (err, result) => {
      if (err) {
        return done(err);
      }

      assert.strictEqual(result, value);
      done();
    });
  });

  it('streams a varchar(max) value from an async iterable', function(done) {
    const value = 'streamed value '.repeat(5_000);

    selectParameter(TYPES.VarChar, chunked(value, [3, 0, 4_099, 30_000]), (err, result) => {
      if (err) {
        return done(err);
      }

      assert.strictEqual(result, value);
      done();
    });
  });

  it('streams a varbinary(max) value through a prepared statement', function(done) {
    // `execute` resolves its parameters from the values given to it, so a
    // streamed value reaches the prepared statement the same way it
    // reaches `execSql`.
    const value = randomBytes(100_000);
    let result: unknown;

    const request = new Request('select @param', (err) => {
      if (err) {
        return done(err);
      }

      assert.instanceOf(result, Buffer);
      assert.strictEqual(Buffer.compare(result as Buffer, value), 0);
      done();
    });
    request.addParameter('param', TYPES.VarBinary, undefined, { length: Infinity });
    request.on('row', (columns) => {
      result = columns[0].value;
    });

    request.on('prepared', () => {
      connection.execute(request, { param: chunked(value, [1, 0, 4_097, 20_000, 3]) });
    });

    connection.prepare(request);
  });

  it('fails the request when the source throws, and leaves the connection usable', function(done) {
    const cause = new Error('source failed');

    async function * failing() {
      // Some data is already on the wire before the source fails.
      yield randomBytes(20_000);
      throw cause;
    }

    selectParameter(TYPES.VarBinary, failing(), (err) => {
      assert.instanceOf(err, InputError);
      assert.strictEqual(err!.message, 'Input parameter \'param\' could not be validated');
      assert.strictEqual((err as InputError).cause, cause);

      // The aborted request must not have left the connection in a bad state.
      selectParameter(TYPES.Int, 42, (err, result) => {
        if (err) {
          return done(err);
        }

        assert.strictEqual(result, 42);
        done();
      });
    });
  });

  describe('table-valued parameters', function() {
    beforeEach(function() {
      if (config.options.tdsVersion! < '7_3_A') {
        this.skip();
      }
    });

    beforeEach(function(done) {
      connection.execSqlBatch(new Request(`
        DROP PROCEDURE IF EXISTS [__tediousStreamedTvpTest];
        DROP TYPE IF EXISTS [__tediousStreamedTvpType];
        CREATE TYPE [__tediousStreamedTvpType] AS TABLE (a int, b nvarchar(50));
      `, done));
    });

    beforeEach(function(done) {
      connection.execSqlBatch(new Request(`
        CREATE PROCEDURE [__tediousStreamedTvpTest] @tvp __tediousStreamedTvpType readonly AS BEGIN
          select a, b from @tvp order by a
        END
      `, done));
    });

    afterEach(function(done) {
      connection.execSqlBatch(new Request(`
        DROP PROCEDURE IF EXISTS [__tediousStreamedTvpTest];
        DROP TYPE IF EXISTS [__tediousStreamedTvpType];
      `, done));
    });

    it('streams rows from an async iterable', function(done) {
      // Enough rows to cross the serialization flush size several times.
      const rowCount = 5_000;

      async function * rows() {
        for (let i = 0; i < rowCount; i++) {
          yield [i, `row ${i}`];
        }
      }

      const received: Array<[number, string]> = [];

      const request = new Request('__tediousStreamedTvpTest', (err) => {
        if (err) {
          return done(err);
        }

        assert.lengthOf(received, rowCount);
        for (let i = 0; i < rowCount; i++) {
          assert.deepEqual(received[i], [i, `row ${i}`]);
        }
        done();
      });

      request.on('row', (columns) => {
        received.push([columns[0].value, columns[1].value]);
      });

      request.addParameter('tvp', TYPES.TVP, {
        columns: [
          { name: 'a', type: TYPES.Int },
          { name: 'b', type: TYPES.NVarChar, length: 50 }
        ],
        rows: rows()
      });

      connection.callProcedure(request);
    });

    it('fails the request when a streamed row is invalid, and leaves the connection usable', function(done) {
      async function * rows() {
        yield [1, 'ok'];
        yield ['not a number', 'bad'];
      }

      const request = new Request('__tediousStreamedTvpTest', (err) => {
        assert.instanceOf(err, InputError);
        assert.strictEqual(err!.message, 'Input parameter \'tvp\' could not be validated');
        assert.instanceOf((err as InputError).cause, InputError);
        assert.strictEqual(((err as InputError).cause as InputError).message, 'TVP column \'a\' has invalid data at row index 1');

        selectParameter(TYPES.Int, 42, (err, result) => {
          if (err) {
            return done(err);
          }

          assert.strictEqual(result, 42);
          done();
        });
      });

      request.addParameter('tvp', TYPES.TVP, {
        columns: [
          { name: 'a', type: TYPES.Int },
          { name: 'b', type: TYPES.NVarChar, length: 50 }
        ],
        rows: rows()
      });

      connection.callProcedure(request);
    });
  });
});
