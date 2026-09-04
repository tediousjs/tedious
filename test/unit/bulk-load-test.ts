import { assert } from 'chai';
import BulkLoad from '../../src/bulk-load';
import { BulkLoadPayload } from '../../src/bulk-load-payload';
import { type InternalConnectionOptions } from '../../src/connection';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { typeByName as TYPES } from '../../src/data-type';

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

    it('hands what it has downstream once the row source goes idle', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      let resumed = false;
      const payload = new BulkLoadPayload(request, (async function*() {
        yield [1];
        await new Promise((resolve) => setTimeout(resolve, 20));
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
