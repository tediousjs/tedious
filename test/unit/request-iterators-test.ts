import { assert } from 'chai';

import Request from '../../src/request';
import { RequestError } from '../../src/errors';
import { type ColumnMetadata } from '../../src/token/colmetadata-token-parser';

function createRequest() {
  return new Request('select 1', () => {});
}

function columns(...names: string[]): ColumnMetadata[] {
  return names.map((colName) => ({ colName } as ColumnMetadata));
}

function emitColumnMetadata(request: Request, cols: ColumnMetadata[]) {
  request.currentColumns = cols;
  request.emit('columnMetadata', cols);
}

async function emitRows(request: Request, batches: unknown[][][]) {
  for (const batch of batches) {
    for (const row of batch) {
      request.emit('row', row);
    }

    // let the microtask based batch flushing run
    await new Promise(setImmediate);
  }
}

describe('Request iteration APIs', function() {
  describe('#rows', function() {
    it('yields all rows across result sets and completes', async function() {
      const request = createRequest();
      const iterator = request.rows();

      const producer = (async () => {
        emitColumnMetadata(request, columns('x'));
        await emitRows(request, [[['a'], ['b']], [['c']]]);
        emitColumnMetadata(request, columns('y'));
        await emitRows(request, [[['d']]]);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const row of iterator) {
        received.push(row);
      }
      await producer;

      assert.deepEqual(received, [['a'], ['b'], ['c'], ['d']]);
    });

    it('throws the request error to the consumer', async function() {
      const request = createRequest();
      const iterator = request.rows();

      const producer = (async () => {
        await emitRows(request, [[['a']]]);
        request.error = new RequestError('Something failed', 'EREQUEST');
        request.emit('requestCompleted');
      })();

      const received = [];
      let error;
      try {
        for await (const row of iterator) {
          received.push(row);
        }
      } catch (err: any) {
        error = err;
      }
      await producer;

      assert.deepEqual(received, [['a']]);
      assert.instanceOf(error, RequestError);
    });

    it('cancels the request when the iteration is abandoned', async function() {
      const request = createRequest();
      const iterator = request.rows();

      const producer = emitRows(request, [[['a'], ['b']]]);

      for await (const row of iterator) {
        void row;
        break;
      }
      await producer;

      assert.isTrue(request.canceled);
    });

    it('enables value array parsing for the request', function() {
      const request = createRequest();
      assert.isFalse(request.iterationRowMode);

      request.rows();

      assert.isTrue(request.iterationRowMode);
    });
  });

  describe('#rowsAsObjects', function() {
    it('yields name keyed rows, using each result set\'s own columns', async function() {
      const request = createRequest();
      const iterator = request.rowsAsObjects();

      const producer = (async () => {
        emitColumnMetadata(request, columns('id', 'name'));
        await emitRows(request, [[[1, 'one'], [2, 'two']]]);
        emitColumnMetadata(request, columns('total'));
        await emitRows(request, [[[42]]]);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const row of iterator) {
        received.push(row);
      }
      await producer;

      assert.deepEqual(received, [
        { id: 1, name: 'one' },
        { id: 2, name: 'two' },
        { total: 42 }
      ]);
    });

    it('lets the first column win for duplicated column names', async function() {
      const request = createRequest();
      const iterator = request.rowsAsObjects();

      const producer = (async () => {
        emitColumnMetadata(request, columns('a', 'a', 'b'));
        await emitRows(request, [[[1, 2, 3]]]);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const row of iterator) {
        received.push(row);
      }
      await producer;

      assert.deepEqual(received, [{ a: 1, b: 3 }]);
    });
  });

  describe('#batches', function() {
    it('does not let batches span result set boundaries', async function() {
      const request = createRequest();
      const iterator = request.batches();

      const producer = (async () => {
        // rows of two result sets, emitted in a single synchronous burst
        emitColumnMetadata(request, columns('x'));
        request.emit('row', ['a']);
        request.emit('row', ['b']);
        emitColumnMetadata(request, columns('y'));
        request.emit('row', ['c']);
        await new Promise(setImmediate);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const batch of iterator) {
        received.push(batch);
      }
      await producer;

      assert.deepEqual(received, [[['a'], ['b']], [['c']]]);
    });
  });

  describe('#resultSets', function() {
    it('exposes each result set with its columns and rows', async function() {
      const request = createRequest();
      const iterator = request.resultSets();

      const producer = (async () => {
        emitColumnMetadata(request, columns('x'));
        await emitRows(request, [[['a'], ['b']]]);
        emitColumnMetadata(request, columns('y'));
        await emitRows(request, [[['c']]]);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const resultSet of iterator) {
        const rows = [];
        for await (const row of resultSet.rows()) {
          rows.push(row);
        }
        received.push({ columns: resultSet.columns.map((c) => c.colName), rows });
      }
      await producer;

      assert.deepEqual(received, [
        { columns: ['x'], rows: [['a'], ['b']] },
        { columns: ['y'], rows: [['c']] }
      ]);
    });

    it('supports name keyed iteration per result set', async function() {
      const request = createRequest();
      const iterator = request.resultSets();

      const producer = (async () => {
        emitColumnMetadata(request, columns('id'));
        await emitRows(request, [[[7]]]);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const resultSet of iterator) {
        for await (const row of resultSet.rowsAsObjects()) {
          received.push(row);
        }
      }
      await producer;

      assert.deepEqual(received, [{ id: 7 }]);
    });

    it('discards unconsumed rows when advancing to the next result set', async function() {
      const request = createRequest();
      const iterator = request.resultSets();

      const producer = (async () => {
        emitColumnMetadata(request, columns('x'));
        await emitRows(request, [[['a'], ['b']]]);
        emitColumnMetadata(request, columns('y'));
        await emitRows(request, [[['c']]]);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const resultSet of iterator) {
        if (resultSet.columns[0].colName === 'x') {
          continue; // skip the first result set without consuming rows
        }

        for await (const row of resultSet.rows()) {
          received.push(row);
        }
      }
      await producer;

      assert.deepEqual(received, [['c']]);
    });

    it('keeps the request running when an inner iterator is abandoned', async function() {
      const request = createRequest();
      const iterator = request.resultSets();

      const producer = (async () => {
        emitColumnMetadata(request, columns('x'));
        await emitRows(request, [[['a'], ['b']]]);
        emitColumnMetadata(request, columns('y'));
        await emitRows(request, [[['c']]]);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const resultSet of iterator) {
        for await (const row of resultSet.rows()) {
          received.push(row);
          break; // abandon after the first row of each result set
        }
        assert.isFalse(request.canceled);
      }
      await producer;

      assert.deepEqual(received, [['a'], ['c']]);
      assert.isFalse(request.canceled);
    });

    it('cancels the request when the outer iteration is abandoned', async function() {
      const request = createRequest();
      const iterator = request.resultSets();

      const producer = (async () => {
        emitColumnMetadata(request, columns('x'));
        await emitRows(request, [[['a']]]);
      })();

      for await (const resultSet of iterator) {
        void resultSet;
        break;
      }
      await producer;

      assert.isTrue(request.canceled);
    });
  });

  describe('mode conflicts', function() {
    it('rejects combining sequentialRows with the other iteration APIs', function() {
      {
        const request = createRequest();
        request.sequentialRows();
        assert.throws(() => request.rows(), /cannot be combined/);
      }

      {
        const request = createRequest();
        request.rows();
        assert.throws(() => request.sequentialRows(), /cannot be combined/);
      }
    });
  });
});
