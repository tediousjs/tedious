import { assert } from 'chai';
import { typeByName as TYPES } from '../../src/data-type';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  const config = {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION
    }
  };

  return config;
}

describe('Prepare Execute Statement', function() {
  it('should prepare execute', function(done) {
    const value = 8;

    const config = getConfig();

    const request = new Request('select @param', function(err) {
      assert.ifError(err);
      connection.close();
    });
    request.addParameter('param', TYPES.Int);

    const connection = new Connection(config);

    request.on('prepared', function() {
      assert.ok(request.handle);
      connection.execute(request, { param: value });
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns.length, 1);
      assert.strictEqual(columns[0].value, value);
    });

    connection.connect(function(err) {
      assert.ifError(err);
      connection.prepare(request);
    });

    connection.on('end', function() {
      done();
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('does not cause unexpected `returnValue` events to be emitted', function(done) {
    const config = getConfig();

    const connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.connect(function(err) {
      if (err) {
        return done(err);
      }

      const returnValues: { parameterName: string, value: unknown, metadata: import('../../src/metadata-parser').Metadata }[] = [];

      const request = new Request('select @param', function(err) {
        if (err) {
          return done(err);
        }

        assert.lengthOf(returnValues, 1);

        connection.close();
      });
      request.addParameter('param', TYPES.Int);

      request.on('prepared', function() {
        assert.ok(request.handle);

        assert.lengthOf(returnValues, 1);
        assert.strictEqual(returnValues[0].parameterName, 'handle');

        connection.execute(request, { param: 8 });
      });

      request.on('returnValue', (parameterName, value, metadata) => {
        returnValues.push({ parameterName, value, metadata });
      });

      connection.prepare(request);
    });

    connection.on('end', function() {
      done();
    });
  });

  it('does not leak memory via EventEmitter listeners when reusing a request many times', function(done) {
    const config = getConfig();

    let eventEmitterLeak = false;

    const onWarning: NodeJS.WarningListener = (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        eventEmitterLeak = true;
      }
    };
    process.on('warning', onWarning);

    let count = 0;
    const request = new Request('select 1', function(err) {
      assert.ifError(err);

      if (count < 20) {
        count += 1;

        connection.execute(request);
      } else {
        connection.close();
      }
    });

    const connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    request.on('prepared', function() {
      connection.execute(request);
    });

    connection.connect(function(err) {
      if (err) {
        return done(err);
      }

      connection.prepare(request);
    });

    connection.on('end', function() {
      process.removeListener('warning', onWarning);

      if (eventEmitterLeak) {
        assert.fail('EventEmitter memory leak detected');
      }

      done();
    });
  });

  it('should not persist error state between executions of prepared statement (GH#1712)', async function() {
    const config = getConfig();

    const connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    // Helper to execute the prepared statement and return the result
    const execute = (divisor: number) => {
      return new Promise<number>((resolve, reject) => {
        request.once('requestCompleted', () => {
          if (request.error) {
            reject(request.error);
          } else {
            resolve(results[results.length - 1]!);
          }
        });
        connection.execute(request, { divisor });
      });
    };

    // Connect to the database
    await new Promise<void>((resolve, reject) => {
      connection.connect((err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });

    // Prepare a statement that can cause a divide by zero error depending on the parameter
    const request = new Request('select 1 / @divisor as result', () => {});
    request.addParameter('divisor', TYPES.Int);

    const results: (number | null)[] = [];
    request.on('row', (columns) => {
      results.push(columns[0].value);
    });

    // Prepare the statement
    await new Promise<void>((resolve) => {
      request.once('prepared', () => {
        assert.ok(request.handle);
        resolve();
      });
      connection.prepare(request);
    });

    // First execution: should succeed with divisor = 1
    const result1 = await execute(1);
    assert.strictEqual(result1, 1, 'First execution should return 1');

    // Second execution: should fail with divisor = 0 (divide by zero)
    try {
      await execute(0);
      assert.fail('Second execution should have thrown an error');
    } catch (err) {
      assert.include((err as Error).message, 'Divide by zero', 'Error should be divide by zero');
    }

    // Third execution: should succeed with divisor = 2
    // Before the fix, this would throw the error from the second execution
    // This is the key assertion for GH#1712
    const result3 = await execute(2);
    assert.strictEqual(result3, 0, 'Third execution should return 0 (1/2 truncated to int)');

    // Unprepare and close
    await new Promise<void>((resolve) => {
      connection.on('end', () => {
        resolve();
      });
      connection.unprepare(request);
      connection.close();
    });
  });

  it('should test unprepare', function(done) {
    const config = getConfig();
    const request = new Request('select 3', function(err) {
      assert.ifError(err);
      connection.close();
    });

    const connection = new Connection(config);

    request.on('prepared', function() {
      assert.ok(request.handle);
      connection.unprepare(request);
    });

    connection.connect(function(err) {
      assert.ifError(err);
      connection.prepare(request);
    });

    connection.on('end', function() {
      done();
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });
});
