import { assert } from 'chai';
import { Readable } from 'stream';
import iconv from 'iconv-lite';

import RpcRequestPayload from '../../src/rpcrequest-payload';
import { typeByName as TYPES, resolveParameter, type Parameter } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import { Collation, Flags } from '../../src/collation';
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

    for (const [name, type, expected] of [
      ['VarBinary', TYPES.VarBinary, 'varbinary(max)'],
      ['NVarChar', TYPES.NVarChar, 'nvarchar(max)'],
      ['VarChar', TYPES.VarChar, 'varchar(max)']
    ] as const) {
      it(name + ' declaration is the max form for an async source', function() {
        // This declaration is what `execSql` passes to `sp_executesql` as the
        // parameter's type; it must be `max`, not the length of the source.
        assert.strictEqual(type.declaration(param({ type, value: Readable.from([]) })), expected);
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

    it('keeps a varchar surrogate pair split across chunks (UTF-8 collation)', async function() {
      const utf8Collation = new Collation(0x0409, Flags.UTF8, 0, 0);
      assert.strictEqual(utf8Collation.codepage, 'utf-8');

      // A source that yields the two halves of one emoji in separate chunks
      // must produce the same UTF-8 as encoding the whole string at once.
      const streamed = await collect(new RpcRequestPayload('p', [resolveParameter(param({ type: TYPES.VarChar, value: from(['a\uD83D', '\uDE00b']) }), utf8Collation, options)], txnDescriptor, options));
      assert.deepEqual(plpData(streamed), Buffer.from('a\u{1F600}b', 'utf-8'));
    });

    it('keeps a varchar surrogate pair split across chunks (CP932 collation)', async function() {
      // A double-byte codepage cannot represent an astral character, but the
      // stitched result must still match encoding the whole string at once
      // (one replacement character, not two).
      const cp932Collation = new Collation(0x0411, 0, 0, 0);
      assert.strictEqual(cp932Collation.codepage, 'CP932');

      const streamed = await collect(new RpcRequestPayload('p', [resolveParameter(param({ type: TYPES.VarChar, value: from(['a\uD83D', '\uDE00b']) }), cp932Collation, options)], txnDescriptor, options));
      assert.deepEqual(plpData(streamed), iconv.encode('a\u{1F600}b', 'CP932'));
    });

    it('matches the in-memory serialization of the same varbinary value', async function() {
      const value = Buffer.from('the quick brown fox'.repeat(10));
      const streamed = await collect(new RpcRequestPayload('p', [resolveParameter(param({ value: from([value]) }), undefined, options)], txnDescriptor, options));
      // An in-memory varbinary(max): same value, forced past the inline limit.
      const inMemory = await collect(new RpcRequestPayload('p', [resolveParameter(param({ value, length: Infinity }), undefined, options)], txnDescriptor, options));
      assert.deepEqual(plpData(streamed), plpData(inMemory));
    });
  });

  describe('crossing the CHUNK_SIZE flush boundary', function() {
    it('reassembles a varbinary source larger than one chunk', async function() {
      // 25 KB in 5 KB chunks: crosses the 8 KB flush/consume boundary repeatedly.
      const chunks = Array.from({ length: 5 }, (_, i) => Buffer.alloc(5000, i + 1));
      const bytes = await collect(new RpcRequestPayload('p', [resolveParameter(param({ value: from(chunks) }), undefined, options)], txnDescriptor, options));
      assert.deepEqual(plpData(bytes), Buffer.concat(chunks));
    });

    it('reassembles an nvarchar source larger than one chunk', async function() {
      const chunks = Array.from({ length: 5 }, (_, i) => String.fromCharCode(0x41 + i).repeat(3000));
      const bytes = await collect(new RpcRequestPayload('p', [resolveParameter(param({ type: TYPES.NVarChar, value: from(chunks) }), collation, options)], txnDescriptor, options));
      assert.deepEqual(plpData(bytes), Buffer.from(chunks.join(''), 'ucs2'));
    });

    it('serializes a TVP of many rows the same from an array and an async source', async function() {
      // ~2000 rows well past FLUSH_SIZE, so both writeRows and writeRowsFrom flush mid-stream.
      const columns = [
        { name: 'id', type: TYPES.Int },
        { name: 'name', type: TYPES.NVarChar, length: 20 }
      ];
      const rows = Array.from({ length: 2000 }, (_, i) => [i, 'row ' + i]);
      const fromArray = await collect(new RpcRequestPayload('p', [resolveParameter(param({ type: TYPES.TVP, value: { name: 'T', columns, rows } }), collation, options)], txnDescriptor, options));
      const fromAsync = await collect(new RpcRequestPayload('p', [resolveParameter(param({ type: TYPES.TVP, value: { name: 'T', columns, rows: from(rows) } }), collation, options)], txnDescriptor, options));
      assert.deepEqual(fromAsync, fromArray);
      // Sanity: the request really is larger than one flush chunk.
      assert.isAbove(fromArray.length, 8 * 1024);
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

  it('surfaces a TVP async row validation failure as InputError', async function() {
    const columns = [{ name: 'n', type: TYPES.TinyInt }];
    async function * rows() {
      yield [1];
      yield [256]; // out of range for TinyInt
    }
    const resolved = resolveParameter(param({ type: TYPES.TVP, name: 'tvp', value: { name: 'T', columns, rows: rows() } }), collation, options);

    let error: unknown;
    try {
      await collect(new RpcRequestPayload('p', [resolved], txnDescriptor, options));
    } catch (err) {
      error = err;
    }
    assert.instanceOf(error, InputError);
    assert.strictEqual((error as InputError).message, "Input parameter 'tvp' could not be validated");
    assert.instanceOf((error as InputError).cause, InputError);
    assert.include(((error as InputError).cause as InputError).message, "TVP column 'n'");
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
