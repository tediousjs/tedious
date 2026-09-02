import { assert } from 'chai';

import RpcRequestPayload from '../../src/rpcrequest-payload';
import { InputError } from '../../src/errors';
import { typeByName as TYPES, type Parameter, resolveParameter } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import { CHUNK_SIZE } from '../../src/tracking-buffer/writable-tracking-buffer';

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;
const txnDescriptor = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);

const columns = [
  { name: 'id', type: TYPES.Int },
  { name: 'name', type: TYPES.NVarChar, length: 50 }
];

function buildRows(count: number): unknown[][] {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push([i, 'row ' + i]);
  }
  return rows;
}

async function serialize(rows: unknown): Promise<Buffer> {
  const parameter: Parameter = { type: TYPES.TVP, name: 'tvp', value: { name: 'TestType', columns, rows }, output: false };
  const payload = new RpcRequestPayload('proc', [parameter], txnDescriptor, options, undefined);

  const chunks = [];
  for await (const chunk of payload) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

describe('Streaming TVP', function() {
  it('serializes rows from an array', async function() {
    const data = await serialize(buildRows(3));

    // TVP_ROW token for each row, and the TVP_END tokens.
    assert.strictEqual(data.filter((b) => b === 0x01).length >= 3, true);
    assert.strictEqual(data[data.length - 1], 0x00);
  });

  it('serializes rows from a synchronous iterable identically', async function() {
    const fromArray = await serialize(buildRows(100));
    const fromIterable = await serialize((function*() {
      yield* buildRows(100);
    })());

    assert.deepEqual(fromIterable, fromArray);
  });

  it('serializes rows from an asynchronous iterable identically', async function() {
    const fromArray = await serialize(buildRows(100));
    const fromAsyncIterable = await serialize((async function*() {
      for (const row of buildRows(100)) {
        await new Promise((resolve) => setImmediate(resolve));
        yield row;
      }
    })());

    assert.deepEqual(fromAsyncIterable, fromArray);
  });

  it('validates rows given as an array before anything is serialized', function() {
    assert.throws(() => {
      resolveParameter({ type: TYPES.TVP, name: 'tvp', value: { name: 'TestType', columns, rows: [[1, 'ok'], ['not a number', 'bad']] }, output: false }, undefined, options);
    }, InputError, /TVP column 'id' has invalid data at row index 1/);
  });

  it('reports invalid streamed rows while serializing', async function() {
    let error;
    try {
      await serialize((async function*() {
        yield [1, 'ok'];
        yield ['not a number', 'bad'];
      })());
    } catch (err: any) {
      error = err;
    }

    assert.instanceOf(error, InputError);
    assert.match(error.message, /Input parameter 'tvp' could not be validated/);
    assert.instanceOf(error.cause, InputError);
    assert.match(error.cause.message, /TVP column 'id' has invalid data at row index 1/);
  });

  it('closes the row source when the consumer stops early', async function() {
    let sourceClosed = false;
    let rowsPulled = 0;

    const source = (async function*() {
      try {
        while (true) {
          rowsPulled++;
          yield [rowsPulled, 'row'];
        }
      } finally {
        sourceClosed = true;
      }
    })();

    const parameter: Parameter = { type: TYPES.TVP, name: 'tvp', value: { name: 'TestType', columns, rows: source }, output: false };
    const payload = new RpcRequestPayload('proc', [parameter], txnDescriptor, options, undefined);

    const iterator = payload[Symbol.asyncIterator]();
    for (let i = 0; i < 20; i++) {
      await iterator.next();
    }
    await iterator.return!(undefined);

    assert.isTrue(sourceClosed);
    // Rows are pulled lazily, a chunk's worth at a time - an infinite source
    // only produced what was consumed. Each row is 14 bytes here.
    assert.isBelow(rowsPulled, 20 * CHUNK_SIZE / 14 + 1);
  });
});
