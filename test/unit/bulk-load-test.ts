import { assert } from 'chai';
import BulkLoad from '../../src/bulk-load';
import { type InternalConnectionOptions } from '../../src/connection';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { typeByName as TYPES } from '../../src/data-type';

// Test options - using type assertion since tests only exercise code paths
// that use a subset of the full InternalConnectionOptions
const connectionOptions = { tdsVersion: '7_2' } as InternalConnectionOptions;

describe('BulkLoad', function() {
  describe('row serialization', function() {
    it('hands rows downstream in packet-sized chunks rather than one chunk per row', function(done) {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });
      request.addColumn('name', TYPES.NVarChar, { length: 50, nullable: true });

      const rowCount = 2000;
      const chunks: Buffer[] = [];
      const transform = request.rowToPacketTransform;

      transform.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      transform.on('end', () => {
        const data = Buffer.concat(chunks);

        // COLMETADATA first, DONE (13 bytes on TDS 7.2+) last, and the
        // rows in between coalesced into chunks of at most CHUNK_SIZE bytes.
        assert.strictEqual(data[0], 0x81);
        assert.strictEqual(data[data.length - 13], 0xFD);
        assert.isBelow(chunks.length, rowCount / 20);
        for (const chunk of chunks) {
          assert.isAtMost(chunk.length, WritableTrackingBuffer.CHUNK_SIZE);
        }

        done();
      });

      for (let i = 0; i < rowCount; i++) {
        transform.write([i, 'row ' + i]);
      }
      transform.end();
    });

    it('hands a chunk downstream right away once a row fills it', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('blob', TYPES.VarBinary, { length: WritableTrackingBuffer.CHUNK_SIZE + 1000, nullable: false });

      const chunks: Buffer[] = [];
      const transform = request.rowToPacketTransform;
      transform.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      // A single row larger than a chunk is flushed synchronously, without
      // waiting for further rows or for the source to go idle.
      const value = Buffer.alloc(WritableTrackingBuffer.CHUNK_SIZE + 1000, 0xAB);
      transform.write([value]);

      assert.isAtLeast(chunks.length, 1);
      const data = Buffer.concat(chunks);
      assert.strictEqual(data[0], 0x81);
      // The value is the last thing in the row, ahead of the 4-byte PLP terminator.
      assert.strictEqual(data.indexOf(value), data.length - value.length - 4);
    });

    it('produces the same bytes as serializing each row on its own', function(done) {
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

      const chunks: Buffer[] = [];
      const transform = request.rowToPacketTransform;
      transform.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      transform.on('end', () => {
        assert.deepEqual(Buffer.concat(chunks), Buffer.concat(expected));
        done();
      });

      for (const row of rows) {
        transform.write(row);
      }
      transform.end();
    });

    it('hands nothing downstream after a row fails, even with a flush pending', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const chunks: Buffer[] = [];
      const transform = request.rowToPacketTransform;
      transform.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      const failed = new Promise<Error>((resolve) => transform.on('error', resolve));

      // A valid row schedules an idle flush; the next row fails validation
      // before that flush gets a turn.
      transform.write([1]);
      transform.write(['not a number']);

      const error = await failed;
      assert.instanceOf(error, TypeError);
      assert.isTrue(transform.destroyed);

      await new Promise((resolve) => setImmediate(resolve));
      assert.lengthOf(chunks, 0);
    });

    it('hands what it has downstream once the row source goes idle', async function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });

      const chunks: Buffer[] = [];
      const transform = request.rowToPacketTransform;
      transform.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      transform.write([1]);
      assert.lengthOf(chunks, 0);

      // The row is far smaller than a chunk; it still goes downstream as
      // soon as no further rows arrive.
      await new Promise((resolve) => setImmediate(resolve));
      assert.lengthOf(chunks, 1);
      assert.strictEqual(chunks[0][0], 0x81);

      const ended = new Promise((resolve) => transform.on('end', resolve));
      transform.end();
      await ended;

      assert.lengthOf(chunks, 2);
      assert.strictEqual(chunks[1][0], 0xFD);
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
