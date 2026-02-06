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
      assert.isDefined(request.handle);
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
        assert.isDefined(request.handle);

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

  it('should test unprepare', function(done) {
    const config = getConfig();
    const request = new Request('select 3', function(err) {
      assert.ifError(err);
      connection.close();
    });

    const connection = new Connection(config);

    request.on('prepared', function() {
      assert.isDefined(request.handle);
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
