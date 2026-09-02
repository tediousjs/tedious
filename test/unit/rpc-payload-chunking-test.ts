import { assert } from 'chai';

import RpcRequestPayload from '../../src/rpcrequest-payload';
import { typeByName as TYPES, type Parameter } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;
const txnDescriptor = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);

async function collect(parameters: Parameter[]): Promise<Buffer[]> {
  const payload = new RpcRequestPayload('proc', parameters, txnDescriptor, options, undefined);

  const chunks = [];
  for await (const chunk of payload) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('RpcRequestPayload chunking', function() {
  it('sends small scalar parameters as a single chunk', async function() {
    const parameters: Parameter[] = [];
    for (let i = 0; i < 20; i++) {
      parameters.push({ type: TYPES.Int, name: 'int' + i, value: i, output: false });
      parameters.push({ type: TYPES.NVarChar, name: 'str' + i, value: 'value ' + i, output: false });
    }

    const chunks = await collect(parameters);
    assert.lengthOf(chunks, 1);
  });

  it('passes large values through without copying them', async function() {
    const value = Buffer.alloc(1024 * 1024, 0x42);
    const parameters: Parameter[] = [
      { type: TYPES.Int, name: 'before', value: 1, output: false },
      { type: TYPES.VarBinary, name: 'blob', value, output: false, length: Infinity },
      { type: TYPES.Int, name: 'after', value: 2, output: false }
    ];

    const chunks = await collect(parameters);
    const index = chunks.indexOf(value);
    assert.notStrictEqual(index, -1, 'the value buffer itself should be yielded');

    // Everything before the value (procedure header, `@before`, the PLP
    // header of `@blob`) is coalesced, as is everything after it.
    assert.strictEqual(index, 1);
    assert.lengthOf(chunks, 3);

    const data = Buffer.concat(chunks);
    // ... PLP length (unknown), chunk length, value, terminator
    const valueOffset = data.indexOf(value);
    assert.deepEqual(data.subarray(valueOffset - 12, valueOffset - 4), Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
    assert.strictEqual(data.readUInt32LE(valueOffset - 4), value.length);
    assert.deepEqual(data.subarray(valueOffset + value.length, valueOffset + value.length + 4), Buffer.from([0, 0, 0, 0]));
  });

  it('bounds the size of coalesced chunks', async function() {
    const parameters: Parameter[] = [];
    for (let i = 0; i < 100; i++) {
      parameters.push({ type: TYPES.NVarChar, name: 'str' + i, value: 'x'.repeat(500), output: false });
    }

    const chunks = await collect(parameters);
    assert.isAbove(chunks.length, 1);
    for (const chunk of chunks) {
      assert.isBelow(chunk.length, 2 * 8 * 1024);
    }
    assert.strictEqual(Buffer.concat(chunks).length, (await collect(parameters)).reduce((n, c) => n + c.length, 0));
  });
});
