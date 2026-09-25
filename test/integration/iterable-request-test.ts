import { assert } from 'chai';

import Connection from '../../src/connection';
import { RequestError } from '../../src/errors';
import IterableRequest, { type ColumnValue } from '../../src/iterable-request';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  const config = {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION,
    }
  };

  return config;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('Iterable Request Test', function() {
  this.timeout(10000);
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.connect(done);
  });

  afterEach(function(done) {
    if (connection.closed) {
      done();
    } else {
      connection.on('end', done);
      connection.close();
    }
  });

  it('tests basic functionality of the iterable request with use of internal FIFO', async function() {
    const n = 20000;
    const sql = `
        with cte1 as
          (select 1 as i union all select i + 1 from cte1 where i < ${n})
        select i from cte1 option (maxrecursion 0)
      `;

    const request = new IterableRequest(sql);
    connection.execSql(request);

    let ctr = 0;
    for await (const item of request) {
      assert(item.resultSetNo === 1);
      const row = item.row as ColumnValue[];
      const i = row[0].value;
      assert(i === ctr + 1);
      if (ctr === Math.floor(n / 2)) {
        await sleep(250);
      }
      ctr++;
    }
    assert(ctr === n);
  });

  it('tests an iterable request with multiple result sets', async function() {
    const sql = `
        select 1, 'abc'
        select 2
        select 3, 555
      `;

    const request = new IterableRequest(sql);
    connection.execSql(request);

    let ctr = 0;
    for await (const item of request) {
      assert(item.resultSetNo === ctr + 1);
      const row = item.row as ColumnValue[];
      const i = row[0].value;
      assert(i === ctr + 1);
      ctr++;
    }
    assert(ctr === 3);
  });

  it('checks that a for loop with an iterable request can be aborted before the end of the result set', async function() {

    await testForLoop(10000, 500);
    await testForLoop(10000, 3);
    await testForLoop(10000, 250, 100);
    await testForLoop(100, 100);

    async function testForLoop(n: number, abortCount: number, sleepPos = -1) {
      const sql = `
          with cte1 as
            (select 1 as i union all select i + 1 from cte1 where i < ${n})
          select i from cte1 option (maxrecursion 0)
        `;

      const request = new IterableRequest(sql);
      connection.execSql(request);

      let ctr = 0;
      for await (const item of request) {
        const row = item.row as ColumnValue[];
        const i = row[0].value;
        assert(i === ctr + 1);
        if (ctr === sleepPos) {
          await sleep(250);
        }
        ctr++;
        if (ctr === abortCount) {
          break;
        }
      }
      assert(ctr === abortCount);
    }

  });

  it('tests the error handling logic of the iterable request module', async function() {
    const sql = `
        select 1
        select 2
        select 3 / 0
      `;

    const request = new IterableRequest(sql);
    connection.execSql(request);

    let ctr = 0;
    let errCtr = 0;
    try {
      for await (const item of request) {
        assert(item.resultSetNo === ctr + 1);
        const row = item.row as ColumnValue[];
        const i = row[0].value;
        assert(i === ctr + 1);
        ctr++;
      }
    } catch (err) {
      assert.instanceOf(err, RequestError);
      assert((err as RequestError).message.toLowerCase().includes('divide by zero'));
      errCtr++;
    }
    assert(ctr === 2);
    assert(errCtr === 1);
  });


});
