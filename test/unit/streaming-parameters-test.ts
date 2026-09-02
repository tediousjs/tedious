import { assert } from 'chai';
import { Readable } from 'stream';

import RpcRequestPayload from '../../src/rpcrequest-payload';
import { typeByName as TYPES, resolveParameter, type Parameter } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import { Collation } from '../../src/collation';
import { InputError } from '../../src/errors';

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;
const collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xd0, 0x00, 0x34]));
const txnDescriptor = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);

const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const PLP_TERMINATOR = Buffer.from([0x00, 0x00, 0x00, 0x00]);

function param(overrides: Partial<Parameter>): Parameter {
  return { type: TYPES.VarBinary, name: 'p', value: null, output: false, ...overrides };
}

async function * from(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function collect(payload: Iterable<Buffer> | AsyncIterable<Buffer>) {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Parses the last PLP value in a serialized request: returns the concatenated
// chunk data, or null if it is not an unknown-length PLP value.
function plpData(buffer: Buffer): Buffer | null {
  const start = buffer.lastIndexOf(UNKNOWN_PLP_LEN);
  if (start === -1) {
    return null;
  }

  let pos = start + UNKNOWN_PLP_LEN.length;
  const parts: Buffer[] = [];
  while (pos + 4 <= buffer.length) {
    const length = buffer.readUInt32LE(pos);
    pos += 4;
    if (length === 0) {
      break;
    }
    parts.push(buffer.subarray(pos, pos + length));
    pos += length;
  }
  return Buffer.concat(parts);
}

describe('streaming parameters', function() {
  describe('resolve marks an async source as streamed', function() {
    for (const [name, type, collationArg] of [
      ['VarBinary', TYPES.VarBinary, undefined],
      ['NVarChar', TYPES.NVarChar, collation],
      ['VarChar', TYPES.VarChar, collation]
    ] as const) {
      it(name, function() {
        const resolved = resolveParameter(param({ type, value: Readable.from([]) }), collationArg, options);
        assert.strictEqual(resolved.data.streamed, true);
        // A streamed value has no known length, so it is sent as a `max` type.
        assert.isAbove(resolved.data.length!, (type as { maximumLength: number }).maximumLength);
        assert.strictEqual(typeof resolved.type.writeValueStream, 'function');
      });
    }

    it('leaves an in-memory value unstreamed', function() {
      const resolved = resolveParameter(param({ type: TYPES.VarBinary, value: Buffer.from([1, 2, 3]) }), undefined, options);
      assert.notStrictEqual(resolved.data.streamed, true);
    });
  });

  describe('the payload iterates synchronously unless a value is streamed', function() {
    it('is synchronous with only in-memory values', function() {
      const resolved = resolveParameter(param({ type: TYPES.Int, value: 1 }), undefined, options);
      const payload = new RpcRequestPayload('p', [resolved], txnDescriptor, options);
      assert.strictEqual(payload.streamed, false);
      assert.strictEqual((payload as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator], undefined);
    });

    it('is asynchronous when a value is streamed', function() {
      const resolved = resolveParameter(param({ value: Readable.from([]) }), undefined, options);
      const payload = new RpcRequestPayload('p', [resolved], txnDescriptor, options);
      assert.strictEqual(payload.streamed, true);
      assert.strictEqual(typeof (payload as AsyncIterable<Buffer>)[Symbol.asyncIterator], 'function');
    });
  });

  describe('the streamed value is the PLP of its source', function() {
    it('writes varbinary chunks and skips empty ones', async function() {
      const chunks = [Buffer.from([1, 2, 3]), Buffer.alloc(0), Buffer.from([4, 5])];
      const resolved = resolveParameter(param({ value: from(chunks) }), undefined, options);
      const bytes = await collect(new RpcRequestPayload('p', [resolved], txnDescriptor, options));
      assert.deepEqual(plpData(bytes), Buffer.from([1, 2, 3, 4, 5]));
      assert.isTrue(bytes.subarray(bytes.lastIndexOf(UNKNOWN_PLP_LEN)).includes(PLP_TERMINATOR));
    });

    it('encodes nvarchar chunks as UCS-2', async function() {
      const resolved = resolveParameter(param({ type: TYPES.NVarChar, value: from(['ab', 'c']) }), collation, options);
      const bytes = await collect(new RpcRequestPayload('p', [resolved], txnDescriptor, options));
      assert.deepEqual(plpData(bytes), Buffer.from('abc', 'ucs2'));
    });

    it('matches the in-memory serialization of the same varbinary value', async function() {
      const value = Buffer.from('the quick brown fox'.repeat(10));
      const streamed = await collect(new RpcRequestPayload('p', [resolveParameter(param({ value: from([value]) }), undefined, options)], txnDescriptor, options));
      // An in-memory varbinary(max): same value, forced past the inline limit.
      const inMemory = await collect(new RpcRequestPayload('p', [resolveParameter(param({ value, length: Infinity }), undefined, options)], txnDescriptor, options));
      assert.deepEqual(plpData(streamed), plpData(inMemory));
    });
  });

  it('surfaces a failing source as InputError naming the parameter', async function() {
    async function * boom() {
      yield Buffer.from([1]);
      throw new RangeError('source broke');
    }
    const resolved = resolveParameter(param({ name: 'blob', value: boom() }), undefined, options);

    let error: unknown;
    try {
      await collect(new RpcRequestPayload('p', [resolved], txnDescriptor, options));
    } catch (err) {
      error = err;
    }
    assert.instanceOf(error, InputError);
    assert.strictEqual((error as InputError).message, "Input parameter 'blob' could not be validated");
    assert.instanceOf((error as InputError).cause, RangeError);
  });

  it('serializes a TVP from an async iterable of rows exactly as from an array', async function() {
    const columns = [
      { name: 'id', type: TYPES.Int },
      { name: 'name', type: TYPES.NVarChar, length: 20 }
    ];
    const rows = [[1, 'a'], [2, 'bb'], [3, 'ccc']];
    const table = { name: 'T', columns, rows };
    const streamedTable = { name: 'T', columns, rows: from(rows) };

    const fromArray = await collect(new RpcRequestPayload('p', [resolveParameter(param({ type: TYPES.TVP, value: table }), collation, options)], txnDescriptor, options));
    const fromAsync = await collect(new RpcRequestPayload('p', [resolveParameter(param({ type: TYPES.TVP, value: streamedTable }), collation, options)], txnDescriptor, options));
    assert.deepEqual(fromAsync, fromArray);
  });
});
