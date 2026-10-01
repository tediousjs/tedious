import { assert } from 'chai';
import { Readable } from 'stream';

import BulkLoad from '../../src/bulk-load';
import { BulkLoadPayload } from '../../src/bulk-load-payload';
import RpcRequestPayload from '../../src/rpcrequest-payload';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { typeByName as TYPES, resolveParameter, type DataType, type Parameter, type ColumnData } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import { Collation } from '../../src/collation';
import { InputError } from '../../src/errors';

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;
const collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xd0, 0x00, 0x34]));
const txnDescriptor = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
const MAX = 65535;

function param(overrides: Partial<Parameter>): Parameter {
  return { type: TYPES.VarBinary, name: 'p', value: null, output: false, ...overrides };
}

async function * from(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function collect(payload: AsyncIterable<Buffer>) {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function throughCompiledWriter(type: DataType, column: ColumnData, value: unknown) {
  const buffer = new WritableTrackingBuffer();
  assert.isUndefined(type.compileWriter(column, options)(buffer, value));
  return buffer.data;
}

describe('compiled writers', function() {
  describe('validate the value', function() {
    it('rejects an invalid value with the error validate gives', function() {
      const cases: Array<[DataType, ColumnData, unknown, RegExp]> = [
        [TYPES.Int, {}, 'abc', /Invalid number/],
        [TYPES.Int, {}, 2147483648, /between -2147483648 and 2147483647/],
        [TYPES.NVarChar, { length: 50, collation }, 42, /Invalid string/],
        [TYPES.VarBinary, { length: 50 }, 'abc', /Invalid buffer/],
        [TYPES.VarChar, { length: 50, collation }, 42, /Invalid string/],
        [TYPES.VarChar, { length: 50 }, 'abc', /No collation was set/],
        [TYPES.Bit, {}, undefined, /^$/]
      ];

      for (const [type, column, value, message] of cases) {
        let expected: Error | undefined;
        try {
          type.validate(value, column.collation);
        } catch (err) {
          expected = err as Error;
        }

        if (expected === undefined) {
          assert.doesNotThrow(() => throughCompiledWriter(type, column, value));
          continue;
        }

        assert.throws(() => throughCompiledWriter(type, column, value), expected.constructor as ErrorConstructor, message);
      }
    });

    it('rejects a source for a column that is not max', function() {
      for (const [type, column] of [[TYPES.VarBinary, { length: 50 }], [TYPES.NVarChar, { length: 50, collation }], [TYPES.VarChar, { length: 50, collation }]] as const) {
        assert.throws(() => type.compileWriter(column, options)(new WritableTrackingBuffer(), from([])), TypeError);
      }
    });

    it('returns the rest of the write for a source in a max column', async function() {
      // One non-empty chunk: a source read in several chunks is written as
      // several PLP chunks, valid but not byte-identical to the in-memory
      // form; the integration suite round-trips those.
      for (const [type, column, chunks, whole] of [
        [TYPES.VarBinary, { length: MAX }, [Buffer.alloc(0), Buffer.from([1, 2, 3]), Buffer.alloc(0)], Buffer.from([1, 2, 3])],
        [TYPES.NVarChar, { length: MAX, collation }, ['', 'abc'], 'abc'],
        [TYPES.VarChar, { length: MAX, collation }, ['abü', ''], 'abü']
      ] as const) {
        const buffer = new WritableTrackingBuffer();
        const rest = type.compileWriter(column, options)(buffer, from([...chunks]));
        assert.isDefined(rest);
        let yields = 0;
        for await (const flush of rest!) {
          assert.isUndefined(flush);
          yields++;
        }
        assert.strictEqual(yields, 0, 'no chunk\'s worth here');
        assert.deepEqual(buffer.data, throughCompiledWriter(type, column, whole));
      }
    });
  });

  describe('a TVP row with a cell read from a source', function() {
    const columns = [
      { name: 'id', type: TYPES.Int },
      { name: 'blob', type: TYPES.VarBinary, length: MAX },
      { name: 'text', type: TYPES.NVarChar, length: MAX }
    ];
    const blob = Buffer.alloc(20000, 0xAB);
    const text = 'y'.repeat(6000);

    function tvp(rows: unknown[] | AsyncIterable<unknown[]>) {
      return resolveParameter(param({ type: TYPES.TVP, name: 'tvp', value: { name: 'T', columns, rows } }), collation, options);
    }

    it('serializes exactly as the same row with the cells in memory', async function() {
      const inMemory = await collect(new RpcRequestPayload('p', [tvp([[1, blob, text], [2, null, null]])], txnDescriptor, options));

      const fromArrayRows = await collect(new RpcRequestPayload('p', [tvp([[1, from([Buffer.alloc(0), blob]), from([text, ''])], [2, null, null]])], txnDescriptor, options));
      assert.deepEqual(fromArrayRows, inMemory);

      const fromAsyncRows = await collect(new RpcRequestPayload('p', [tvp(from([[1, from([blob]), from([text])], [2, null, null]]) as AsyncIterable<unknown[]>)], txnDescriptor, options));
      assert.deepEqual(fromAsyncRows, inMemory);
    });

    it('hands chunks on while the cell is being read', async function() {
      let read = 0;
      async function * chunks() {
        for (let i = 0; i < 8; i++) {
          read++;
          yield Buffer.alloc(WritableTrackingBuffer.CHUNK_SIZE, i);
        }
      }
      const iterator = new RpcRequestPayload('p', [tvp([[1, chunks(), null]])], txnDescriptor, options)[Symbol.asyncIterator]();
      const first = await iterator.next();
      assert.isFalse(first.done);
      assert.isBelow(read, 8);
      await iterator.return!();
    });

    it('surfaces a failing source as the column\'s InputError', async function() {
      async function * boom() {
        yield Buffer.from([1]);
        throw new RangeError('source broke');
      }

      let error: unknown;
      try {
        await collect(new RpcRequestPayload('p', [tvp([[1, boom(), null]])], txnDescriptor, options));
      } catch (err) {
        error = err;
      }
      assert.instanceOf(error, InputError);
      assert.instanceOf((error as InputError).cause, InputError);
      assert.strictEqual(((error as InputError).cause as InputError).message, "TVP column 'blob' has invalid data at row index 0");
      assert.instanceOf(((error as InputError).cause as InputError).cause, RangeError);
    });

    it('rejects a source in a column that is not max', async function() {
      const narrow = [{ name: 'id', type: TYPES.Int }, { name: 'bin', type: TYPES.VarBinary, length: 50 }];
      const resolved = resolveParameter(param({ type: TYPES.TVP, name: 'tvp', value: { name: 'T', columns: narrow, rows: [[1, from([Buffer.alloc(1)])]] } }), collation, options);

      let error: unknown;
      try {
        await collect(new RpcRequestPayload('p', [resolved], txnDescriptor, options));
      } catch (err) {
        error = err;
      }
      assert.instanceOf(error, InputError);
      assert.match(((error as InputError).cause as InputError).message, /TVP column 'bin' has invalid data at row index 0/);
    });
  });

  describe('a bulk load row with a cell read from a source', function() {
    function bulkLoad() {
      const request = new BulkLoad('tablename', collation, options, {}, () => {});
      request.addColumn('id', TYPES.Int, { nullable: false });
      request.addColumn('blob', TYPES.VarBinary, { length: MAX, nullable: true });
      request.addColumn('text', TYPES.NVarChar, { length: MAX, nullable: true });
      return request;
    }
    const blob = Buffer.alloc(20000, 0xCD);
    const text = 'z'.repeat(6000);

    it('serializes exactly as the same row with the cells in memory', async function() {
      const inMemory = await collect(new BulkLoadPayload(bulkLoad(), [[1, blob, text], [2, null, null]]));
      const streamed = await collect(new BulkLoadPayload(bulkLoad(), [[1, from([blob, Buffer.alloc(0)]), Readable.from([text])], [2, null, null]]));
      assert.deepEqual(streamed, inMemory);
    });

    it('hands chunks on while the cell is being read', async function() {
      let read = 0;
      async function * chunks() {
        for (let i = 0; i < 8; i++) {
          read++;
          yield Buffer.alloc(WritableTrackingBuffer.CHUNK_SIZE, i);
        }
      }
      const iterator = new BulkLoadPayload(bulkLoad(), [[1, chunks(), null]])[Symbol.asyncIterator]();
      const first = await iterator.next();
      assert.isFalse(first.done);
      assert.isBelow(read, 8);
      await iterator.return!();
    });

    it('fails the bulk load with the column\'s InputError when the source fails, and closes the row source', async function() {
      let closed = false;
      async function * boom() {
        yield Buffer.from([1]);
        throw new RangeError('source broke');
      }
      async function * rows() {
        try {
          yield [1, boom(), null];
        } finally {
          closed = true;
        }
      }

      let error: unknown;
      try {
        await collect(new BulkLoadPayload(bulkLoad(), rows()));
      } catch (err) {
        error = err;
      }
      assert.instanceOf(error, InputError);
      assert.strictEqual((error as InputError).message, "Column 'blob' could not be serialized");
      assert.instanceOf((error as InputError).cause, RangeError);
      assert.isTrue(closed);
    });
  });
});
