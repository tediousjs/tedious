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

  it('should not persist error state between executions of prepared statement', function(done) {
    const config = getConfig();

    const connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    // Prepare a statement that can cause a divide by zero error depending on the parameter
    const request = new Request('select 1 / @divisor as result', function() {});
    request.addParameter('divisor', TYPES.Int);

    let executionCount = 0;
    const results: (number | null)[] = [];
    const errors: (Error | undefined)[] = [];

    request.on('row', function(columns) {
      results.push(columns[0].value);
    });

    request.on('prepared', function() {
      assert.ok(request.handle);

      // First execution: should succeed with divisor = 1
      request.once('requestCompleted', function() {
        executionCount++;
        errors.push(request.error);

        // Second execution: should fail with divisor = 0 (divide by zero)
        request.once('requestCompleted', function() {
          executionCount++;
          errors.push(request.error);

          // Third execution: should succeed with divisor = 2
          // Before the fix, this would report the error from the second execution
          request.once('requestCompleted', function() {
            executionCount++;
            errors.push(request.error);

            // Unprepare the statement and wait for it to complete before closing
            request.once('requestCompleted', function() {
              connection.close();
            });
            connection.unprepare(request);
          });

          connection.execute(request, { divisor: 2 });
        });

        connection.execute(request, { divisor: 0 });
      });

      connection.execute(request, { divisor: 1 });
    });

    connection.connect(function(err) {
      if (err) {
        return done(err);
      }

      connection.prepare(request);
    });

    connection.on('end', function() {
      // Verify the behavior
      assert.strictEqual(executionCount, 3, 'Should have completed 3 executions');

      // First execution succeeded
      assert.isUndefined(errors[0], 'First execution should have no error');
      assert.strictEqual(results[0], 1, 'First execution should return 1');

      // Second execution failed with divide by zero
      assert.isDefined(errors[1], 'Second execution should have an error');
      assert.include(errors[1]!.message, 'Divide by zero', 'Error should be divide by zero');

      // Third execution succeeded - this is the key assertion for GH#1712
      assert.isUndefined(errors[2], 'Third execution should have no error (error state should be cleared)');
      assert.strictEqual(results[1], 0, 'Third execution should return 0 (1/2 truncated to int)');

      done();
    });
  });

  it('should not persist parameter validation errors between executions of prepared statement', function(done) {
    const config = getConfig();

    const connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    const errors: (Error | null | undefined)[] = [];
    const results: (number | null)[] = [];

    const request = new Request('select 1 / @divisor as result', function(err) {
      errors.push(err ?? undefined);
    });
    request.addParameter('divisor', TYPES.Int);

    request.on('row', function(columns) {
      results.push(columns[0].value);
    });

    request.on('prepared', function() {
      assert.ok(request.handle);

      // First execution: fails client-side parameter validation,
      // `request.error` is set without the request ever being sent
      request.once('requestCompleted', function() {
        // Second execution: should succeed with a valid parameter value.
        // Before the fix, this would report the stale validation error.
        request.once('requestCompleted', function() {
          request.once('requestCompleted', function() {
            connection.close();
          });
          connection.unprepare(request);
        });

        connection.execute(request, { divisor: 1 });
      });

      connection.execute(request, { divisor: 'not a number' });
    });

    connection.connect(function(err) {
      if (err) {
        return done(err);
      }

      connection.prepare(request);
    });

    connection.on('end', function() {
      // First execution failed with a validation error
      assert.isDefined(errors[0], 'First execution should have a validation error');
      assert.include(errors[0]!.message, 'Invalid number', 'Error should be the validation error');

      // Second execution succeeded and the validation error was not re-reported
      assert.isUndefined(errors[1], 'Second execution should have no error (error state should be cleared)');
      assert.strictEqual(results[0], 1, 'Second execution should return 1');

      done();
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
