import { assert } from 'chai';
import { getEventListeners } from 'events';
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

// Assert that an execution failed because its abort signal was aborted with
// the given reason.
function assertAbortError(error: unknown, reason: unknown) {
  assert.instanceOf(error, RequestError);
  assert.strictEqual((error as RequestError).code, 'ABORT_ERR');
  assert.strictEqual((error as RequestError).name, 'AbortError');
  assert.strictEqual((error as RequestError).cause, reason);
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
      it('cancels the request when the signal is aborted, and fails with an abort error', async function() {
        const controller = new AbortController();
        const reason = new Error('no longer needed');

        const { request: req, completed } = request("WAITFOR DELAY '00:00:05'");
        execute(req, { signal: controller.signal });

        await delay(100);
        controller.abort(reason);

        const { error } = await completed;
        assertAbortError(error, reason);

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
        assertAbortError(error, reason);

        assert.strictEqual(await querySingleValue('SELECT COUNT(*) FROM #executions'), 0);
      });
    });
  }

  it('fails with an abort error caused by the reason of a timeout signal', async function() {
    const { request: req, completed } = request("WAITFOR DELAY '00:00:05'");
    connection.execSql(req, { signal: AbortSignal.timeout(100) });

    const { error } = await completed;
    assert.instanceOf(error, RequestError);
    assert.strictEqual((error as RequestError).code, 'ABORT_ERR');
    assert.instanceOf((error as RequestError).cause, DOMException);
    assert.strictEqual(((error as RequestError).cause as DOMException).name, 'TimeoutError');
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
    assertAbortError(error, reason);
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

    assert.lengthOf(executions, 2);
    assertAbortError(executions[0], reason);
    assert.isUndefined(executions[1]);
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

    it('cancels the bulk load when the signal is aborted, and fails with an abort error', async function() {
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
      assertAbortError(error, reason);

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
      assertAbortError(error, reason);
      assert.isTrue(closed);

      assert.strictEqual(await querySingleValue('SELECT COUNT(*) FROM #bulk'), 0);
    });

    it('does not let an execution that is rejected while the bulk load is in progress affect its signal', async function() {
      const errors: Array<Error | null | undefined> = [];
      let resolve!: () => void;
      const completed = new Promise<void>((r) => {
        resolve = r;
      });

      // Both executions call back to the same callback: the rejected one
      // first, then the one in progress.
      const bulkLoad = connection.newBulkLoad('#bulk', (error) => {
        errors.push(error);
        if (errors.length === 2) {
          resolve();
        }
      });
      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      await querySingleValue(bulkLoad.getTableCreationSql());

      const controller = new AbortController();
      const reason = new Error('no longer needed');

      let secondExecution!: () => void;
      const secondExecuted = new Promise<void>((r) => {
        secondExecution = r;
      });

      let canceledBySignal = false;

      async function* rows() {
        yield { id: 1 };

        // Wait until the bulk load was executed a second time, with a signal
        // that is aborted already, while this execution is in progress.
        await secondExecuted;
        await delay(100);

        // The first execution's signal must still cancel it.
        controller.abort(reason);
        canceledBySignal = bulkLoad.canceled;
        await delay(100);
        yield { id: 2 };
      }

      connection.execBulkLoad(bulkLoad, rows(), { signal: controller.signal });

      // Wait for the `INSERT BULK` statement to complete, i.e. until the
      // rows are being sent.
      await new Promise<void>((r) => {
        const check = () => {
          if (connection.request === bulkLoad) {
            r();
          } else {
            setImmediate(check);
          }
        };
        check();
      });

      connection.execBulkLoad(bulkLoad, [{ id: 3 }], { signal: AbortSignal.abort(new Error('second execution')) });

      assert.lengthOf(errors, 1);
      assert.instanceOf(errors[0], RequestError);
      assert.strictEqual((errors[0] as RequestError).code, 'EINVALIDSTATE');
      assert.isFalse(bulkLoad.canceled, 'the rejected execution canceled the one in progress');
      assert.lengthOf(getEventListeners(controller.signal, 'abort'), 1, 'the rejected execution removed the signal listener of the one in progress');
      secondExecution();

      // The execution in progress completes once its own signal canceled it,
      // with the abort error: the rejection does not affect its error.
      await completed;
      assert.isTrue(canceledBySignal, 'the signal did not cancel the execution in progress');
      assertAbortError(errors[1], reason);
      // The cancellation only applied to that execution.
      assert.isFalse(bulkLoad.canceled);

      assert.strictEqual(await querySingleValue('SELECT COUNT(*) FROM #bulk'), 0);
    });

    it('can execute a bulk load again after it was canceled while its `INSERT BULK` statement was executed', async function() {
      const errors: Array<Error | null | undefined> = [];
      let resolve!: (rowCount: number | undefined) => void;
      const completed = new Promise<number | undefined>((r) => {
        resolve = r;
      });

      const bulkLoad = connection.newBulkLoad('#bulk', (error, rowCount) => {
        errors.push(error);

        if (errors.length === 1) {
          // The cancellation only applied to the first execution.
          connection.execBulkLoad(bulkLoad, [{ id: 1 }, { id: 2 }]);
          return;
        }

        resolve(rowCount);
      });
      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      await querySingleValue(bulkLoad.getTableCreationSql());

      connection.execBulkLoad(bulkLoad, [{ id: 3 }]);
      // The `INSERT BULK` statement is being sent.
      bulkLoad.cancel();

      const rowCount = await completed;
      assert.instanceOf(errors[0], RequestError);
      assert.strictEqual((errors[0] as RequestError).code, 'ECANCEL');
      assert.ifError(errors[1]);
      assert.strictEqual(rowCount, 2);

      assert.strictEqual(await querySingleValue('SELECT COUNT(*) FROM #bulk'), 2);
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
