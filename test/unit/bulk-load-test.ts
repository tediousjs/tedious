import { assert } from 'chai';
import { Readable } from 'stream';
import { EventEmitter } from 'events';
import BulkLoad from '../../src/bulk-load';
import { BulkLoadPayload } from '../../src/bulk-load-payload';
import { type InternalConnectionOptions } from '../../src/connection';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { typeByName as TYPES, type DataType } from '../../src/data-type';

// Test options - using type assertion since tests only exercise code paths
// that use a subset of the full InternalConnectionOptions
const connectionOptions = { tdsVersion: '7_2' } as InternalConnectionOptions;

describe('BulkLoad', function() {
  describe('row serialization', function() {
    async function collect(payload: AsyncIterable<Buffer>) {
      const chunks: Buffer[] = [];
      for await (const chunk of payload) {
        chunks.push(chunk);
      }
      return chunks;
    }

    it('hands rows downstream in packet-sized chunks rather than one chunk per row', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });
      request.addColumn('name', TYPES.NVarChar, { length: 50, nullable: true });

      const rowCount = 2000;
      const rows: unknown[][] = [];
      for (let i = 0; i < rowCount; i++) {
        rows.push([i, 'row ' + i]);
      }

      const chunks = await collect(new BulkLoadPayload(request, rows));
      const data = Buffer.concat(chunks);

      // COLMETADATA first, DONE (13 bytes on TDS 7.2+) last, and the
      // rows in between coalesced into chunks of at most CHUNK_SIZE bytes.
      assert.strictEqual(data[0], 0x81);
      assert.strictEqual(data[data.length - 13], 0xFD);
      assert.isBelow(chunks.length, rowCount / 20);
      for (const chunk of chunks) {
        assert.isAtMost(chunk.length, WritableTrackingBuffer.CHUNK_SIZE);
      }
    });

    it('sends COLMETADATA and DONE for a bulk load with no rows', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const data = Buffer.concat(await collect(new BulkLoadPayload(request, [])));

      // The server rejects a bulk load message that carries only DONE.
      assert.deepEqual(data, Buffer.concat([request.getColMetaData(), request.createDoneToken()]));
    });

    it('does not read rows before the bytes are consumed', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      let pulled = false;
      const payload = new BulkLoadPayload(request, (function*() {
        pulled = true;
        yield [1];
      })());

      // Creating the payload and its iterator touches nothing.
      payload[Symbol.asyncIterator]();
      assert.isFalse(pulled);
    });

    it('accepts a synchronous iterable with an undefined async iterator property', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const rows = { [Symbol.asyncIterator]: undefined, *[Symbol.iterator]() { yield [1]; yield [2]; } };
      const data = Buffer.concat(await collect(new BulkLoadPayload(request, rows)));

      assert.strictEqual(data[0], 0x81);
      assert.strictEqual(data[data.length - 13], 0xFD);
      assert.lengthOf(data.filter((byte) => byte === 0xD1), 2);
    });

    it('keeps an error a stream source emits before the rows are read', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const source = new Readable({ objectMode: true, read() {} });
      const payload = new BulkLoadPayload(request, source);

      // The stream fails while nothing reads from it yet. Without a
      // listener this would be an unhandled `'error'` event.
      const expected = new Error('source failed');
      source.destroy(expected);
      await new Promise((resolve) => setImmediate(resolve));

      let error;
      try {
        await collect(payload);
      } catch (err) {
        error = err;
      }
      assert.strictEqual(error, expected);
    });

    it('hands a chunk downstream right away once a row fills it', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('blob', TYPES.VarBinary, { length: WritableTrackingBuffer.CHUNK_SIZE + 1000, nullable: false });

      const value = Buffer.alloc(WritableTrackingBuffer.CHUNK_SIZE + 1000, 0xAB);
      let secondRowPulled = false;
      const payload = new BulkLoadPayload(request, (async function*() {
        yield [value];
        secondRowPulled = true;
        yield [Buffer.alloc(1)];
      })());

      // A single row larger than a chunk is handed downstream before the
      // next row is read, without waiting for the source to go idle.
      // Pull chunks until the whole row (the value is followed by the 4-byte
      // PLP terminator) has arrived, then stop.
      const chunks: Buffer[] = [];
      let data = Buffer.alloc(0);
      for await (const chunk of payload) {
        chunks.push(chunk);
        data = Buffer.concat(chunks);
        const index = data.indexOf(value);
        if (index !== -1 && data.length >= index + value.length + 4) {
          break;
        }
      }

      assert.isFalse(secondRowPulled);
      assert.strictEqual(data[0], 0x81);
      // The value is the last thing in the row, ahead of the 4-byte PLP terminator.
      assert.strictEqual(data.indexOf(value), data.length - value.length - 4);
    });

    it('hands a chunk downstream in the middle of a wide row', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});

      // Three cells of 6,000 bytes: the second one takes the buffer past
      // CHUNK_SIZE, so the first chunk goes out before the third cell is
      // serialized.
      const serialized: string[] = [];
      const tracking = (name: string): DataType => ({
        ...TYPES.VarBinary,
        *generateParameterData(parameter, options) {
          serialized.push(name);
          yield* TYPES.VarBinary.generateParameterData(parameter, options);
        }
      });
      request.addColumn('a', tracking('a'), { length: 6000, nullable: false });
      request.addColumn('b', tracking('b'), { length: 6000, nullable: false });
      request.addColumn('c', tracking('c'), { length: 6000, nullable: false });

      const row = [Buffer.alloc(6000, 1), Buffer.alloc(6000, 2), Buffer.alloc(6000, 3)];
      const iterator = new BulkLoadPayload(request, [row])[Symbol.asyncIterator]();

      const first = await iterator.next();
      assert.isFalse(first.done);
      assert.deepEqual(serialized, ['a', 'b']);

      const chunks = [first.value!];
      for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) {
        chunks.push(chunk);
      }
      assert.deepEqual(serialized, ['a', 'b', 'c']);
      const data = Buffer.concat(chunks);
      assert.strictEqual(data[data.length - 13], 0xFD);
    });

    it('produces the same bytes as serializing each row on its own', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });
      request.addColumn('name', TYPES.NVarChar, { length: 50, nullable: true });
      request.addColumn('blob', TYPES.VarBinary, { length: 9000, nullable: true });

      const rows: unknown[][] = [];
      for (let i = 0; i < 300; i++) {
        rows.push([i, i % 7 ? 'row ' + i : null, i % 5 ? Buffer.alloc(i % 3 ? 10 : 9000, i) : null]);
      }

      // The reference: COLMETADATA, each row serialized into its own buffer
      // (a ROW token, then every cell), DONE.
      const expected = [request.getColMetaData()];
      for (const row of rows) {
        const buffer = new WritableTrackingBuffer();
        buffer.writeUInt8(0xD1);
        request.columns.forEach((column, i) => {
          const value = column.type.validate(row[i], column.collation);
          const parameter = { length: column.length, scale: column.scale, precision: column.precision, value };
          buffer.writeBuffer(column.type.generateParameterLength(parameter, connectionOptions));
          for (const chunk of column.type.generateParameterData(parameter, connectionOptions)) {
            buffer.writeBuffer(chunk);
          }
        });
        expected.push(buffer.slice());
      }
      expected.push(request.createDoneToken());

      const fromArray = await collect(new BulkLoadPayload(request, rows));
      assert.deepEqual(Buffer.concat(fromArray), Buffer.concat(expected));

      const fromAsyncSource = await collect(new BulkLoadPayload(request, (async function*() {
        for (const row of rows) {
          await new Promise((resolve) => setImmediate(resolve));
          yield row;
        }
      })()));
      assert.deepEqual(Buffer.concat(fromAsyncSource), Buffer.concat(expected));
    });

    it('hands nothing downstream after a row fails, and closes the row source', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      let closed = false;
      const payload = new BulkLoadPayload(request, (async function*() {
        try {
          // A valid row, then one that fails validation before the first
          // one was handed downstream.
          yield [1];
          yield ['not a number'];
          yield [2];
        } finally {
          closed = true;
        }
      })());

      const chunks: Buffer[] = [];
      let error;
      try {
        for await (const chunk of payload) {
          chunks.push(chunk);
        }
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, TypeError);
      assert.lengthOf(chunks, 0);
      assert.isTrue(closed);
    });

    it('closes the row source when the consumer stops early', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      let closed = false;
      const payload = new BulkLoadPayload(request, (async function*() {
        try {
          let i = 0;
          while (true) {
            yield [i++];
          }
        } finally {
          closed = true;
        }
      })());

      const iterator = payload[Symbol.asyncIterator]();
      await iterator.next();
      await iterator.return();

      assert.isTrue(closed);
    });

    it('keeps the row error when the source fails to close', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const rows = [[1], ['not a number']];
      const source: AsyncIterable<unknown[]> = {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            next: async (): Promise<IteratorResult<unknown[]>> => (i < rows.length ? { value: rows[i++], done: false } : { value: undefined, done: true }),
            return: async () => { throw new Error('close failed'); }
          };
        }
      };

      let error;
      try {
        await collect(new BulkLoadPayload(request, source));
      } catch (err) {
        error = err;
      }
      assert.instanceOf(error, TypeError);
    });

    it('reports a source that fails to close when the consumer stops early', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const expected = new Error('close failed');
      const source: AsyncIterable<unknown[]> = {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            next: async (): Promise<IteratorResult<unknown[]>> => ({ value: [i++], done: false }),
            return: async () => { throw expected; }
          };
        }
      };

      const iterator = new BulkLoadPayload(request, source)[Symbol.asyncIterator]();
      await iterator.next();

      let error;
      try {
        await iterator.return();
      } catch (err) {
        error = err;
      }
      assert.strictEqual(error, expected);
    });

    it('does not treat an unrelated `on` method as an event emitter', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const source = {
        on() {
          throw new Error('not an event emitter');
        },
        removeListener() {
          throw new Error('not an event emitter');
        },
        *[Symbol.iterator]() {
          yield [1];
        }
      };

      const data = Buffer.concat(await collect(new BulkLoadPayload(request, source)));
      assert.strictEqual(data[0], 0x81);
    });

    it('closes the row source when a column fails to write its TYPE_INFO', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      const expected = new Error('no TYPE_INFO for you');
      const type: DataType = { ...TYPES.Int, generateTypeInfo() { throw expected; } };
      request.addColumn('id', type, { nullable: false });

      // A generator that was never pulled skips its `finally` on `return()`,
      // so the call is recorded on a hand-written iterator instead.
      let closed = false;
      const source: AsyncIterable<unknown[]> = {
        [Symbol.asyncIterator]() {
          return {
            next: async (): Promise<IteratorResult<unknown[]>> => ({ value: [1], done: false }),
            return: async (): Promise<IteratorResult<unknown[]>> => {
              closed = true;
              return { value: undefined, done: true };
            }
          };
        }
      };

      let error;
      try {
        await collect(new BulkLoadPayload(request, source));
      } catch (err) {
        error = err;
      }
      assert.strictEqual(error, expected);
      assert.isTrue(closed);
    });

    it('surfaces an error an event-emitting source emits without failing its iterator', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const expected = new Error('source broke');
      class Source extends EventEmitter {
        async *[Symbol.asyncIterator]() {
          yield [1];
          this.emit('error', expected);
          yield [2];
        }
      }
      const source = new Source();

      let error;
      try {
        await collect(new BulkLoadPayload(request, source));
      } catch (err) {
        error = err;
      }
      assert.strictEqual(error, expected);
      assert.strictEqual(source.listenerCount('error'), 0);
    });

    it('takes its error listener off an event-emitting source once the rows are read', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      class Source extends EventEmitter {
        async *[Symbol.asyncIterator]() {
          yield [1];
          yield [2];
        }
      }
      const source = new Source();

      const payload = new BulkLoadPayload(request, source);
      assert.strictEqual(source.listenerCount('error'), 1);

      await collect(payload);
      assert.strictEqual(source.listenerCount('error'), 0);

      // The source can be handed to another bulk load without listeners piling up.
      await collect(new BulkLoadPayload(request, source));
      assert.strictEqual(source.listenerCount('error'), 0);
    });

    it('releases a stream source that is closed unread', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const source = new Readable({ objectMode: true, read() {} });
      const payload = new BulkLoadPayload(request, source);

      payload.close();
      assert.isTrue(source.destroyed);
      assert.strictEqual(source.listenerCount('error'), 0);

      // Closing is a one-time thing; a close after the rows were read is a no-op.
      payload.close();
    });

    it('does not throw when a synchronous source fails to close unread', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      let closed = false;
      const payload = new BulkLoadPayload(request, (function*() {
        try {
          yield [1];
        } finally {
          closed = true;
          // eslint-disable-next-line no-unsafe-finally
          throw new Error('close failed');
        }
      })());

      // The generator has not started, so `return()` completes it without
      // running its body; nothing to release, nothing thrown.
      assert.doesNotThrow(() => payload.close());
      assert.isFalse(closed);
    });

    it('does not throw when a started synchronous source fails to close', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      let closed = false;
      const source = (function*() {
        try {
          yield [1];
          yield [2];
        } finally {
          closed = true;
          // eslint-disable-next-line no-unsafe-finally
          throw new Error('close failed');
        }
      })();
      // Pull the first row ourselves so the generator sits inside its `try`.
      source.next();

      const payload = new BulkLoadPayload(request, source);
      assert.doesNotThrow(() => payload.close());
      assert.isTrue(closed);
    });

    it('hands what it has downstream once the row source goes idle', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // The source hands over one row and then waits on something only the
      // test releases, so the order of events does not depend on timers.
      let resume!: () => void;
      const gate = new Promise<void>((resolve) => { resume = resolve; });
      let resumed = false;
      const payload = new BulkLoadPayload(request, (async function*() {
        yield [1];
        await gate;
        resumed = true;
        yield [2];
      })());

      const iterator = payload[Symbol.asyncIterator]();

      // The first row is far smaller than a chunk; it still goes downstream
      // as soon as the source is waiting, before it produces the next row.
      const first = await iterator.next();
      assert.isFalse(first.done);
      assert.isFalse(resumed);
      assert.strictEqual(first.value![0], 0x81);

      resume();
      const chunks = [first.value!];
      for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) {
        chunks.push(chunk);
      }
      assert.isTrue(resumed);
      const data = Buffer.concat(chunks);
      assert.strictEqual(data[data.length - 13], 0xFD);
    });

    it('serializes rows from a synchronous source without touching the event loop', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const rows: unknown[][] = [];
      for (let i = 0; i < 5000; i++) {
        rows.push([i]);
      }

      let turns = 0;
      const tick = () => { turns++; setImmediate(tick); };
      const timer = setImmediate(tick);
      try {
        await collect(new BulkLoadPayload(request, rows));
      } finally {
        clearImmediate(timer);
      }

      // The consumer's `for await` yields to the microtask queue, never to
      // the event loop, and neither does reading from the array.
      assert.strictEqual(turns, 0);
    });
  });

  it('starts out as not being canceled', function() {
    const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
    assert.strictEqual(request.canceled, false);
  });

  describe('#cancel', function() {
    it('marks the request as canceled', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.cancel();
      assert.strictEqual(request.canceled, true);
    });

    it('emits a `cancel` event', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, true);
    });

    it('only emits the `cancel` event on the first call', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.cancel();

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, false);
    });
  });
});
