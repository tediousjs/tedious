import { assert } from 'chai';
import { setTimeout as delay } from 'timers/promises';

import { typeByName as TYPES } from '../../src/data-type';

import BulkLoad from '../../src/bulk-load';
import Connection from '../../src/connection';
import { RequestError } from '../../src/errors';
import Request from '../../src/request';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  return {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      cancelTimeout: 5000,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION
    }
  };
}

interface Completion {
  error: Error | null | undefined;
  rowCount: number | undefined;
}

describe('abort signals', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    connection.connect(done);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', (message) => console.log(message));
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

  // Create a request whose completion is available as a promise.
  function request(sql: string) {
    let resolve!: (completion: Completion) => void;
    const completed = new Promise<Completion>((r) => {
      resolve = r;
    });

    const request = new Request(sql, (error, rowCount) => {
      resolve({ error, rowCount });
    });

    return { request, completed };
  }

  // Run a batch without an abort signal, and return the value of its first
  // column.
  async function querySingleValue(sql: string): Promise<unknown> {
    const { request: req, completed } = request(sql);

    let value: unknown;
    req.on('row', (columns) => {
      value = columns[0].value;
    });

    connection.execSqlBatch(req);

    const { error } = await completed;
    assert.ifError(error);
    return value;
  }

  const executions: Array<[string, (request: Request, options: { signal: AbortSignal }) => void]> = [
    ['execSql', (req, options) => connection.execSql(req, options)],
    ['execSqlBatch', (req, options) => connection.execSqlBatch(req, options)]
  ];

  for (const [method, execute] of executions) {
    describe(method, function() {
      it('cancels the request when the signal is aborted, and fails with the signal\'s reason', async function() {
        const controller = new AbortController();
        const reason = new Error('no longer needed');

        const { request: req, completed } = request("WAITFOR DELAY '00:00:05'");
        execute(req, { signal: controller.signal });

        await delay(100);
        controller.abort(reason);

        const { error } = await completed;
        assert.strictEqual(error, reason);

        // The connection can be used right away.
        assert.strictEqual(await querySingleValue('SELECT 1'), 1);
      });

      it('does not send a request whose signal was aborted already', async function() {
        await querySingleValue('CREATE TABLE #executions (id int)');

        const reason = new Error('aborted before sending');
        const { request: req, completed } = request('INSERT INTO #executions VALUES (1)');

        let calledBack = false;
        completed.then(() => {
          calledBack = true;
        });

        execute(req, { signal: AbortSignal.abort(reason) });
        await Promise.resolve();
        assert.isFalse(calledBack, 'the callback is called asynchronously');

        const { error } = await completed;
        assert.strictEqual(error, reason);

        assert.strictEqual(await querySingleValue('SELECT COUNT(*) FROM #executions'), 0);
      });
    });
  }

  it('fails with the reason of a timeout signal', async function() {
    const { request: req, completed } = request("WAITFOR DELAY '00:00:05'");
    connection.execSql(req, { signal: AbortSignal.timeout(100) });

    const { error } = await completed;
    assert.instanceOf(error, DOMException);
    assert.strictEqual(error!.name, 'TimeoutError');
  });

  it('fails with a cancellation error if the request itself is canceled', async function() {
    const controller = new AbortController();

    const { request: req, completed } = request("WAITFOR DELAY '00:00:05'");
    connection.execSql(req, { signal: controller.signal });

    await delay(100);
    req.cancel();

    const { error } = await completed;
    assert.instanceOf(error, RequestError);
    assert.strictEqual((error as RequestError).code, 'ECANCEL');
  });

  it('ignores a signal that is aborted after the request completed', async function() {
    const executions: Array<Error | null | undefined> = [];
    let onExecuted!: () => void;

    const req = new Request('SELECT 1', (error) => {
      executions.push(error);
      onExecuted();
    });

    const controller = new AbortController();

    const first = new Promise<void>((resolve) => {
      onExecuted = resolve;
    });
    connection.execSql(req, { signal: controller.signal });
    await first;

    controller.abort();

    // Neither the connection nor later executions of the request are
    // affected by the signal.
    assert.strictEqual(await querySingleValue('SELECT 2'), 2);

    const second = new Promise<void>((resolve) => {
      onExecuted = resolve;
    });
    connection.execSql(req);
    await second;

    assert.deepEqual(executions, [undefined, undefined]);
  });

  it('cancels a stored procedure call', async function() {
    const controller = new AbortController();
    const reason = new Error('no longer needed');

    const { request: req, completed } = request('sp_executesql');
    req.addParameter('statement', TYPES.NVarChar, "WAITFOR DELAY '00:00:05'");
    connection.callProcedure(req, { signal: controller.signal });

    await delay(100);
    controller.abort(reason);

    const { error } = await completed;
    assert.strictEqual(error, reason);
  });

  it('cancels an execution of a prepared statement, which can be executed again afterwards', async function() {
    const executions: Array<Error | null | undefined> = [];
    let onExecuted!: () => void;

    const req = new Request('WAITFOR DELAY @delay; SELECT 1', (error) => {
      executions.push(error);
      onExecuted();
    });
    req.addParameter('delay', TYPES.VarChar);

    await new Promise<void>((resolve, reject) => {
      req.once('prepared', resolve);
      req.once('error', reject);
      connection.prepare(req, { signal: new AbortController().signal });
    });

    const controller = new AbortController();
    const reason = new Error('no longer needed');

    const first = new Promise<void>((resolve) => {
      onExecuted = resolve;
    });
    connection.execute(req, { delay: '00:00:05' }, { signal: controller.signal });
    await delay(100);
    controller.abort(reason);
    await first;

    const second = new Promise<void>((resolve) => {
      onExecuted = resolve;
    });
    connection.execute(req, { delay: '00:00:00' });
    await second;

    assert.deepEqual(executions, [reason, undefined]);
  });

  describe('execBulkLoad', function() {
    // Create the bulk load's table, and resolve to the bulk load's
    // completion once it was executed.
    async function prepareBulkLoad(): Promise<{ bulkLoad: BulkLoad, completed: Promise<Completion> }> {
      let resolve!: (completion: Completion) => void;
      const completed = new Promise<Completion>((r) => {
        resolve = r;
      });

      const bulkLoad = connection.newBulkLoad('#bulk', (error, rowCount) => {
        resolve({ error, rowCount });
      });
      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });

      await querySingleValue(bulkLoad.getTableCreationSql());

      return { bulkLoad, completed };
    }

    it('cancels the bulk load when the signal is aborted, and fails with the signal\'s reason', async function() {
      const { bulkLoad, completed } = await prepareBulkLoad();
      const controller = new AbortController();
      const reason = new Error('no longer needed');

      async function* rows() {
        yield { id: 1 };

        // Abort while the bulk load waits for the next row.
        controller.abort(reason);
        await delay(100);
        yield { id: 2 };
      }

      connection.execBulkLoad(bulkLoad, rows(), { signal: controller.signal });

      const { error } = await completed;
      assert.strictEqual(error, reason);

      assert.strictEqual(await querySingleValue('SELECT COUNT(*) FROM #bulk'), 0);
    });

    it('does not start a bulk load whose signal was aborted already, and closes its rows', async function() {
      const { bulkLoad, completed } = await prepareBulkLoad();
      const reason = new Error('aborted before sending');

      let closed = false;
      function* rows() {
        try {
          yield { id: 1 };
        } finally {
          closed = true;
        }
      }

      connection.execBulkLoad(bulkLoad, rows(), { signal: AbortSignal.abort(reason) });

      const { error } = await completed;
      assert.strictEqual(error, reason);
      assert.isTrue(closed);

      assert.strictEqual(await querySingleValue('SELECT COUNT(*) FROM #bulk'), 0);
    });

    it('ignores a signal that is aborted after the bulk load completed', async function() {
      const { bulkLoad, completed } = await prepareBulkLoad();
      const controller = new AbortController();

      connection.execBulkLoad(bulkLoad, [{ id: 1 }, { id: 2 }], { signal: controller.signal });

      const { error, rowCount } = await completed;
      assert.ifError(error);
      assert.strictEqual(rowCount, 2);

      controller.abort();

      assert.strictEqual(await querySingleValue('SELECT COUNT(*) FROM #bulk'), 2);
    });
  });
});
