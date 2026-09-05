import { assert } from 'chai';
import { Readable } from 'stream';
import BulkLoad from '../../src/bulk-load';
import { BulkLoadPayload } from '../../src/bulk-load-payload';
import { type InternalConnectionOptions } from '../../src/connection';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { Collation } from '../../src/collation';
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

    it('sends COLMETADATA and DONE for a bulk load with no rows', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const data = Buffer.concat(await collect(new BulkLoadPayload(request, [])));

      // The server rejects a bulk load message that carries only DONE.
      assert.deepEqual(data, Buffer.concat([request.getColMetaData(), request.createDoneToken()]));
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

    it('takes its error listener off a stream source once the rows are read', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      // The stream's own iterator leaves a listener of its own behind;
      // the payload's must not add to it.
      const plain = Readable.from([[1], [2]], { objectMode: true });
      await collect(plain);

      const source = Readable.from([[1], [2]], { objectMode: true });
      const payload = new BulkLoadPayload(request, source);
      assert.strictEqual(source.listenerCount('error'), 1);

      await collect(payload);
      assert.strictEqual(source.listenerCount('error'), plain.listenerCount('error'));
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

    it('serializes rows given as objects the same as rows given as arrays', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });
      request.addColumn('name', TYPES.NVarChar, { nullable: true, length: 10 });

      const fromArrays = Buffer.concat(await collect(new BulkLoadPayload(request, [[1, 'one'], [2, null]])));
      const fromObjects = Buffer.concat(await collect(new BulkLoadPayload(request, [{ id: 1, name: 'one' }, { id: 2, name: null }])));
      assert.deepEqual(fromObjects, fromArrays);
    });

    it('settles promised rows, as piping the rows through Readable.from did', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });
      request.addColumn('name', TYPES.NVarChar, { nullable: true, length: 10 });

      const plain = Buffer.concat(await collect(new BulkLoadPayload(request, [[1, 'one'], { id: 2, name: null }, [3, 'three']])));
      // Promised rows are outside the declared type; JavaScript callers hand them over.
      const rows = [Promise.resolve([1, 'one']), { id: 2, name: null }, Promise.resolve([3, 'three'])] as unknown as Iterable<unknown[]>;
      const promised = Buffer.concat(await collect(new BulkLoadPayload(request, rows)));
      assert.deepEqual(promised, plain);
    });

    it('fails the bulk load with the rejection of a promised row, and closes the source', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const expected = new Error('row lookup failed');
      let closed = false;
      const rows = (function*() {
        try {
          yield [1];
          yield Promise.reject(expected);
        } finally {
          closed = true;
        }
      })() as unknown as Iterable<unknown[]>;
      const payload = new BulkLoadPayload(request, rows);

      let error;
      try {
        await collect(payload);
      } catch (err) {
        error = err;
      }
      assert.strictEqual(error, expected);
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

    it('writes a text pointer and timestamp before a text value, and a null pointer for none', async function() {
      const collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xD0, 0x00, 0x34]));
      const request = new BulkLoad('tablename', collation, connectionOptions, { }, () => {});
      request.addColumn('note', TYPES.Text, { nullable: true });

      const data = Buffer.concat(await collect(new BulkLoadPayload(request, [['ab'], [null]])));
      const rows = data.subarray(data.indexOf(0xD1), data.length - 13);

      // ROW, 16-byte pointer prefixed by its length, 8-byte timestamp, 4-byte length, data.
      const withValue = Buffer.concat([Buffer.from([0xD1, 0x10]), Buffer.alloc(16, 0), Buffer.alloc(8, 0), Buffer.from([2, 0, 0, 0]), Buffer.from('ab', 'ascii')]);
      // ROW, null pointer.
      const withoutValue = Buffer.from([0xD1, 0x00]);
      assert.deepEqual(rows, Buffer.concat([withValue, withoutValue]));
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
