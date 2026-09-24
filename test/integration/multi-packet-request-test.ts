import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { typeByName as TYPES } from '../../src/data-type';
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

describe('a request whose message spans several packets', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
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

  function execute(value: string) {
    return new Promise<void>((resolve, reject) => {
      const request = new Request('select len(@value)', (err) => {
        err ? reject(err) : resolve();
      });
      request.addParameter('value', TYPES.NVarChar, value, { length: Infinity });
      connection.execSql(request);
    });
  }

  /**
   * The average time in milliseconds to execute a request with the given
   * parameter value.
   */
  async function averageTime(value: string) {
    // Warm up.
    for (let i = 0; i < 3; i++) {
      await execute(value);
    }

    const executions = 10;
    const start = process.hrtime.bigint();
    for (let i = 0; i < executions; i++) {
      await execute(value);
    }
    return Number(process.hrtime.bigint() - start) / 1e6 / executions;
  }

  it('is not delayed by waiting for acknowledgements of its first packets', async function() {
    // With Nagle's algorithm enabled, the last packet of such a message is
    // held back until the server acknowledged the ones before it - which the
    // server delays by ~40ms (delayed acknowledgements).
    const onePacket = await averageTime('x');
    const twoPackets = await averageTime('x'.repeat(3000));

    assert.isBelow(twoPackets - onePacket, 20, `one packet: ${onePacket.toFixed(1)}ms, two packets: ${twoPackets.toFixed(1)}ms`);
  });
});
