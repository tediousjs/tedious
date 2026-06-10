import { assert } from 'chai';

import Request from '../../src/request';
import { RequestError } from '../../src/errors';

function createRequest() {
  return new Request('select 1', () => {});
}

async function emitRows(request: Request, batches: unknown[][]) {
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
        request.emit('columnMetadata', [] as any);
        await emitRows(request, [['a', 'b'], ['c']]);
        request.emit('columnMetadata', [] as any);
        await emitRows(request, [['d']]);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const row of iterator) {
        received.push(row);
      }
      await producer;

      assert.deepEqual(received, ['a', 'b', 'c', 'd']);
    });

    it('throws the request error to the consumer', async function() {
      const request = createRequest();
      const iterator = request.rows();

      const producer = (async () => {
        await emitRows(request, [['a']]);
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

      assert.deepEqual(received, ['a']);
      assert.instanceOf(error, RequestError);
    });

    it('cancels the request when the iteration is abandoned', async function() {
      const request = createRequest();
      const iterator = request.rows();

      const producer = emitRows(request, [['a', 'b']]);

      for await (const row of iterator) {
        void row;
        break;
      }
      await producer;

      assert.isTrue(request.canceled);
    });
  });

  describe('#resultSets', function() {
    it('exposes each result set with its columns and rows', async function() {
      const request = createRequest();
      const iterator = request.resultSets();

      const producer = (async () => {
        request.emit('columnMetadata', [{ colName: 'x' }] as any);
        await emitRows(request, [['a', 'b']]);
        request.emit('columnMetadata', [{ colName: 'y' }] as any);
        await emitRows(request, [['c']]);
        request.emit('requestCompleted');
      })();

      const received = [];
      for await (const resultSet of iterator) {
        const rows = [];
        for await (const row of resultSet.rows()) {
          rows.push(row);
        }
        received.push({ columns: resultSet.columns, rows });
      }
      await producer;

      assert.deepEqual(received, [
        { columns: [{ colName: 'x' }], rows: ['a', 'b'] },
        { columns: [{ colName: 'y' }], rows: ['c'] }
      ]);
    });

    it('discards unconsumed rows when advancing to the next result set', async function() {
      const request = createRequest();
      const iterator = request.resultSets();

      const producer = (async () => {
        request.emit('columnMetadata', [{ colName: 'x' }] as any);
        await emitRows(request, [['a', 'b']]);
        request.emit('columnMetadata', [{ colName: 'y' }] as any);
        await emitRows(request, [['c']]);
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

      assert.deepEqual(received, ['c']);
    });

    it('keeps the request running when an inner iterator is abandoned', async function() {
      const request = createRequest();
      const iterator = request.resultSets();

      const producer = (async () => {
        request.emit('columnMetadata', [{ colName: 'x' }] as any);
        await emitRows(request, [['a', 'b']]);
        request.emit('columnMetadata', [{ colName: 'y' }] as any);
        await emitRows(request, [['c']]);
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

      assert.deepEqual(received, ['a', 'c']);
      assert.isFalse(request.canceled);
    });

    it('cancels the request when the outer iteration is abandoned', async function() {
      const request = createRequest();
      const iterator = request.resultSets();

      const producer = (async () => {
        request.emit('columnMetadata', [{ colName: 'x' }] as any);
        await emitRows(request, [['a']]);
      })();

      for await (const resultSet of iterator) {
        void resultSet;
        break;
      }
      await producer;

      assert.isTrue(request.canceled);
    });
  });
});
