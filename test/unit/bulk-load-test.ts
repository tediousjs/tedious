import { assert } from 'chai';
import { Readable } from 'stream';
import { EventEmitter } from 'events';
import BulkLoad from '../../src/bulk-load';
import { BulkLoadPayload } from '../../src/bulk-load-payload';
import { RequestError } from '../../src/errors';
import Connection, { type InternalConnectionOptions } from '../../src/connection';
import { type Request } from '../../src/tedious';
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

    it('hands rows of null text cells downstream in chunks', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('t', TYPES.Text, { nullable: true });

      // A null text cell is a single null text pointer byte; the chunk
      // boundary must still be checked for it, or a source of such rows
      // would be buffered whole.
      const rowCount = 10000;
      const rows: unknown[][] = [];
      for (let i = 0; i < rowCount; i++) {
        rows.push([null]);
      }

      const chunks = await collect(new BulkLoadPayload(request, rows));
      const data = Buffer.concat(chunks);

      assert.isAbove(chunks.length, 1);
      for (const chunk of chunks) {
        assert.isAtMost(chunk.length, WritableTrackingBuffer.CHUNK_SIZE);
      }
      assert.strictEqual(data[0], 0x81);
      assert.strictEqual(data[data.length - 13], 0xFD);
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

    it('surfaces an error an event-emitting source emits after its last row', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // The error arrives while the source is being asked for the row
      // after its last one, so the bulk load ends with it before DONE
      // goes out.
      const expected = new Error('source broke late');
      class Source extends EventEmitter {
        async *[Symbol.asyncIterator]() {
          yield [1];
          this.emit('error', expected);
        }
      }
      const source = new Source();

      const chunks: Buffer[] = [];
      let error;
      try {
        for await (const chunk of new BulkLoadPayload(request, source)) {
          chunks.push(chunk);
        }
      } catch (err) {
        error = err;
      }
      assert.strictEqual(error, expected);
      assert.lengthOf(chunks, 0);
    });

    it('ends the bulk load when an event-emitting source fails while a row read is pending', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // The source hands over one row, then emits `'error'` while its next
      // read stays pending forever.
      const expected = new Error('source broke mid-read');
      class Source extends EventEmitter implements AsyncIterable<unknown[]> {
        [Symbol.asyncIterator]() {
          let reads = 0;
          return {
            next: (): Promise<IteratorResult<unknown[]>> => {
              if (reads++ === 0) {
                return Promise.resolve({ value: [1], done: false });
              }

              setImmediate(() => { this.emit('error', expected); });
              return new Promise(() => {});
            },
            return: async (): Promise<IteratorResult<unknown[]>> => ({ value: undefined, done: true })
          };
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

    it('only destroys an emitter source when closed unread, and never throws doing so', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      let destroyCalls = 0;
      const plain = {
        destroy() {
          destroyCalls++;
          throw new Error('not a stream');
        },
        *[Symbol.iterator]() {
          yield [1];
        }
      };
      new BulkLoadPayload(request, plain).close();
      assert.strictEqual(destroyCalls, 0);

      class Emitter extends EventEmitter {
        destroy() {
          destroyCalls++;
          throw new Error('destroy failed');
        }

        async *[Symbol.asyncIterator]() {
          yield [1];
        }
      }
      const emitter = new Emitter();
      new BulkLoadPayload(request, emitter).close();
      assert.strictEqual(destroyCalls, 1);

      // `destroy` threw, so nothing more can come from it; the guard
      // comes off once the iterator's own `return()` has settled too.
      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(emitter.listenerCount('error'), 0);
    });

    it('takes its guard off a stream source closed unread once it says it is closed', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      class Emitter extends EventEmitter {
        destroy() {}

        async *[Symbol.asyncIterator]() {
          yield [1];
        }
      }
      const emitter = new Emitter();
      const payload = new BulkLoadPayload(request, emitter);
      payload.close();

      // Guarded while it finishes closing, by nothing that holds on to the payload.
      assert.isAtLeast(emitter.listenerCount('error'), 1);
      assert.notInclude(emitter.listeners('error'), payload.onSourceError);
      emitter.emit('close');
      assert.strictEqual(emitter.listenerCount('close'), 0);

      // The guard also waits for the iterator's `return()` to settle.
      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(emitter.listenerCount('error'), 0);
    });

    it('keeps guarding an emitter source closed unread while its iterator is still closing', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // No `destroy`; the iterator's `return()` lets go of what the source
      // holds open, and reports a failure on a later tick. Without a
      // listener at that point the `'error'` would be unhandled.
      let closed = false;
      class Source extends EventEmitter {
        [Symbol.asyncIterator]() {
          return {
            next: () => Promise.resolve({ done: false, value: [1] }),
            return: () => {
              return new Promise<IteratorResult<unknown[]>>((resolve) => {
                setImmediate(() => {
                  this.emit('error', new Error('cleanup failed'));
                  closed = true;
                  resolve({ done: true, value: undefined });
                });
              });
            }
          };
        }
      }
      const source = new Source();

      new BulkLoadPayload(request, source).close();
      assert.isFalse(closed);
      assert.strictEqual(source.listenerCount('error'), 1);

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      assert.isTrue(closed);
      assert.strictEqual(source.listenerCount('error'), 0);
    });

    it('abandons a pending row read when the bulk load is canceled', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // The source hands over one row and then never delivers another.
      class Source extends EventEmitter {
        async *[Symbol.asyncIterator]() {
          yield [1];
          await new Promise(() => {});
        }
      }
      const source = new Source();
      const payload = new BulkLoadPayload(request, source);
      const iterator = payload[Symbol.asyncIterator]();

      // The first row comes out once the source is idle.
      const first = await iterator.next();
      assert.isFalse(first.done);

      const pending = iterator.next();
      request.cancel();

      let error: any;
      try {
        await pending;
      } catch (err) {
        error = err;
      }
      assert.instanceOf(error, RequestError);
      assert.strictEqual(error.code, 'ECANCEL');
      assert.strictEqual(request.listenerCount('cancel'), 0);
      // The source's `return()` is queued behind the read that never
      // settles, so it never finishes closing, and stays guarded.
      assert.strictEqual(source.listenerCount('error'), 1);
    });

    it('closes without waiting for a stuck source when the bulk load is canceled with a chunk downstream', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // The source hands over one row and then never delivers another.
      class Source extends EventEmitter {
        async *[Symbol.asyncIterator]() {
          yield [1];
          await new Promise(() => {});
        }
      }
      const source = new Source();
      const payload = new BulkLoadPayload(request, source);
      const iterator = payload[Symbol.asyncIterator]();

      // The first row comes out once the source is idle; the payload is
      // now suspended handing it over, with the next read pending.
      const first = await iterator.next();
      assert.isFalse(first.done);

      // Cancellation stops the consumer, which closes the payload as a
      // destroyed stream would. The source's `return()` is queued behind
      // its pending read and never settles; the close must not wait for it.
      request.cancel();
      const closed = await iterator.return(undefined);
      assert.isTrue(closed.done);
      assert.strictEqual(request.listenerCount('cancel'), 0);
    });

    it('keeps guarding an event-emitting source while it is still closing after a failure', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // The source fails out of band with a read pending, and its close
      // reports a failure on a later tick, as a stream's `_destroy` may.
      // Without a listener at that point the `'error'` would be unhandled.
      const expected = new Error('source broke mid-read');
      let closed = false;
      class Source extends EventEmitter {
        [Symbol.asyncIterator]() {
          let count = 0;
          return {
            next: () => {
              if (count++ === 0) {
                return Promise.resolve({ done: false, value: [1] });
              }
              setImmediate(() => { this.emit('error', expected); });
              return new Promise<IteratorResult<unknown[]>>(() => {});
            },
            return: () => {
              return new Promise<IteratorResult<unknown[]>>((resolve) => {
                setImmediate(() => {
                  this.emit('error', new Error('cleanup failed'));
                  closed = true;
                  resolve({ done: true, value: undefined });
                });
              });
            }
          };
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

      // The failure reached the bulk load before the close finished.
      assert.isFalse(closed);
      assert.strictEqual(source.listenerCount('error'), 1);

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      assert.isTrue(closed);
      assert.strictEqual(source.listenerCount('error'), 0);
    });

    it('takes its cancel listener off the bulk load once the rows are read', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const payload = new BulkLoadPayload(request, [[1], [2]]);
      assert.strictEqual(request.listenerCount('cancel'), 1);

      await collect(payload);
      assert.strictEqual(request.listenerCount('cancel'), 0);

      // A cancellation of the completed bulk load reaches nothing of the payload.
      request.cancel();
    });

    it('takes its cancel listener off the bulk load when it is closed unread', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const payload = new BulkLoadPayload(request, [[1], [2]]);
      assert.strictEqual(request.listenerCount('cancel'), 1);

      payload.close();
      assert.strictEqual(request.listenerCount('cancel'), 0);
    });

    it('ends the bulk load when an async generator source fails while a row read is pending', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // An async generator queues `return()` behind its pending `next()`,
      // so the source's cleanup can never finish here; the bulk load must
      // not wait for it.
      const expected = new Error('source broke mid-read');
      class Source extends EventEmitter {
        async *[Symbol.asyncIterator]() {
          yield [1];
          setImmediate(() => { this.emit('error', expected); });
          await new Promise(() => {});
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
      // The source's `return()` is queued behind the read that never
      // settles, so it never finishes closing, and stays guarded.
      assert.strictEqual(source.listenerCount('error'), 1);
    });

    it('keeps guarding a stream source closed unread until it has been destroyed', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // `_destroy` reports its failure asynchronously; without a listener
      // at that point the `'error'` would be unhandled.
      const source = new Readable({
        objectMode: true,
        read() {},
        destroy(_error, callback) {
          setImmediate(() => { callback(new Error('destroy failed')); });
        }
      });

      const payload = new BulkLoadPayload(request, source);
      payload.close();
      assert.isTrue(source.destroyed);
      // The guard stays on (alongside the listener waiting for destruction to finish).
      assert.isAtLeast(source.listenerCount('error'), 1);

      await new Promise((resolve) => source.once('close', resolve));
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

    it('takes everything of its own off a stream closed unread that never emits close', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // Node's default `_destroy` completes synchronously, and with
      // `emitClose: false` that completion is the only signal there is.
      const source = new Readable({ objectMode: true, emitClose: false, read() {} });
      const payload = new BulkLoadPayload(request, source);

      payload.close();
      assert.isTrue(source.destroyed);
      assert.notInclude(source.listeners('error'), payload.onSourceError);

      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(source.listenerCount('error'), 0);
      assert.strictEqual(source.listenerCount('close'), 0);
    });

    it('releases a stream source that is closed unread', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const source = new Readable({ objectMode: true, read() {} });
      const payload = new BulkLoadPayload(request, source);

      payload.close();
      assert.isTrue(source.destroyed);

      // The guard comes off once the stream has closed and its iterator's
      // `return()` has settled.
      await new Promise((resolve) => source.once('close', resolve));
      await new Promise((resolve) => setImmediate(resolve));
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
      let stopped = false;
      const tick = () => {
        turns++;
        if (!stopped) {
          setImmediate(tick);
        }
      };
      const timer = setImmediate(tick);
      try {
        await collect(new BulkLoadPayload(request, rows));
      } finally {
        stopped = true;
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

  describe('#execBulkLoad', function() {
    it('releases the row source when the connection is not logged in by the time the rows would be sent', function(done) {
      // Never connected, so it is not logged in when the `INSERT BULK`
      // statement's callback runs; `makeRequest` rejects the bulk load
      // without reading its rows, and the source must not be left open.
      const connection = new Connection({ server: 'localhost', options: {} });
      connection.execSqlBatch = (request: Request) => {
        process.nextTick(() => { request.callback(undefined); });
      };

      const source = new Readable({ objectMode: true, read() {} });
      const bulkLoad = connection.newBulkLoad('tablename', (err: any) => {
        try {
          assert.instanceOf(err, RequestError);
          assert.strictEqual(err.code, 'EINVALIDSTATE');
          assert.isTrue(source.destroyed);
          assert.strictEqual(bulkLoad.listenerCount('cancel'), 0);
          done();
        } catch (assertion) {
          done(assertion);
        }
      });
      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });

      connection.execBulkLoad(bulkLoad, source);
      assert.isFalse(source.destroyed);
    });
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
