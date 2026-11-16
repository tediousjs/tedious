import { assert } from 'chai';

import BulkLoad from '../../src/bulk-load';
import { BulkLoadPayload } from '../../src/bulk-load-payload';
import RpcRequestPayload from '../../src/rpcrequest-payload';
import Request from '../../src/request';
import { InputError } from '../../src/errors';
import { type InternalConnectionOptions } from '../../src/connection';
import { TYPES, resolveParameter, type Parameter } from '../../src/data-type';

function hex(...parts: string[]) {
  return Buffer.from(parts.join(''), 'hex');
}

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;

// [1, 2.5, -3]
const FLOAT32_VALUE = hex('1400', 'a901030000000000', '0000803f', '00002040', '000040c0');
const FLOAT16_VALUE = hex('0e00', 'a901030001000000', '003c', '0041', '00c2');

async function collect(iterable: AsyncIterable<Buffer>) {
  const chunks = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function bVarchar(value: string) {
  return Buffer.concat([Buffer.from([value.length]), Buffer.from(value, 'ucs2')]);
}

// The bytes of the given parameters in an RPC request, after the request
// header.
async function rpcParameterBytes(parameters: Parameter[]) {
  const txnDescriptor = Buffer.alloc(8);
  const header = await collect(new RpcRequestPayload('proc', [], txnDescriptor, options));
  const resolved = parameters.map((parameter) => resolveParameter(parameter, undefined, options));
  const data = await collect(new RpcRequestPayload('proc', resolved, txnDescriptor, options));
  assert.deepEqual(data.subarray(0, header.length), header);
  return data.subarray(header.length);
}

describe('Vector serialization', function() {
  describe('RPC parameters', function() {
    it('serializes input parameters', async function() {
      const data = await rpcParameterBytes([
        { type: TYPES.Vector, name: 'a', value: [1, 2.5, -3], output: false },
        { type: TYPES.VectorFloat16, name: 'b', value: new Float32Array([1, 2.5, -3]), output: false }
      ]);

      assert.deepEqual(data, Buffer.concat([
        bVarchar('@a'), Buffer.from([0x00, 0xF5, 0x14, 0x00, 0x00]), FLOAT32_VALUE,
        bVarchar('@b'), Buffer.from([0x00, 0xF5, 0x0E, 0x00, 0x01]), FLOAT16_VALUE
      ]));
    });

    it('serializes null and output parameters with the declared dimensions', async function() {
      const data = await rpcParameterBytes([
        { type: TYPES.Vector, name: 'a', value: null, output: false, length: 2 },
        { type: TYPES.VectorFloat16, name: 'b', value: undefined, output: true, length: 4 }
      ]);

      assert.deepEqual(data, Buffer.concat([
        bVarchar('@a'), Buffer.from([0x00, 0xF5, 0x10, 0x00, 0x00, 0xFF, 0xFF]),
        bVarchar('@b'), Buffer.from([0x01, 0xF5, 0x10, 0x00, 0x01, 0xFF, 0xFF])
      ]));
    });

    it('declares parameters for `sp_executesql` and `sp_prepare`', function() {
      const request = new Request('SELECT @a, @b, @c', () => {});
      request.addParameter('a', TYPES.Vector, [1, 2, 3]);
      request.addParameter('b', TYPES.VectorFloat16, [1, 2]);
      request.addOutputParameter('c', TYPES.Vector, null, { length: 1998 });
      request.validateParameters(undefined, options);
      assert.strictEqual(request.makeParamsParameter(request.parameters), '@a vector(3), @b vector(2, float16), @c vector(1998) OUTPUT');
    });

    it('rejects invalid parameters with `EPARAM`', function() {
      const request = new Request('SELECT @a', () => {});
      request.addParameter('a', TYPES.Vector, [1, Number.NaN]);
      assert.throws(() => request.validateParameters(undefined, options), 'Validation failed for parameter \'a\'. Invalid vector: the element at index 1 is not a finite number.');
    });

    it('validates a request that is executed again', function() {
      const request = new Request('SELECT @a', () => {});
      request.addParameter('a', TYPES.Vector, [1, 2]);
      request.validateParameters(undefined, options);
      request.validateParameters(undefined, options);
      assert.deepEqual(request.resolvedParameters[0].data, { value: [1, 2], length: 2 });
    });
  });

  describe('table-valued parameters', function() {
    it('serializes vector columns and cells', async function() {
      const data = await rpcParameterBytes([{
        type: TYPES.TVP,
        name: 't',
        output: false,
        value: {
          name: 'tt',
          columns: [
            { name: 'v', type: TYPES.Vector, length: 3 },
            { name: 'h', type: TYPES.VectorFloat16, length: 3 }
          ],
          rows: [[[1, 2.5, -3], [1, 2.5, -3]], [null, null]]
        }
      }]);

      assert.deepEqual(data, Buffer.concat([
        bVarchar('@t'), Buffer.from([0x00]),
        // TVP TYPE_INFO
        Buffer.from([0xF3]), bVarchar(''), bVarchar(''), bVarchar('tt'),
        // Column metadata
        Buffer.from([0x02, 0x00]),
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF5, 0x14, 0x00, 0x00, 0x00]),
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF5, 0x0E, 0x00, 0x01, 0x00]),
        Buffer.from([0x00]),
        // Rows
        Buffer.from([0x01]), FLOAT32_VALUE, FLOAT16_VALUE,
        Buffer.from([0x01, 0xFF, 0xFF, 0xFF, 0xFF]),
        Buffer.from([0x00])
      ]));
    });

    it('rejects cells whose dimensions do not match the column', async function() {
      const resolved = resolveParameter({
        type: TYPES.TVP,
        name: 't',
        output: false,
        value: { name: 'tt', columns: [{ name: 'v', type: TYPES.Vector, length: 3 }], rows: [[[1, 2]]] }
      }, undefined, options);

      let error: Error | undefined;
      try {
        await collect(new RpcRequestPayload('proc', [resolved], Buffer.alloc(8), options));
      } catch (err) {
        error = err as Error;
      }

      assert.instanceOf(error, InputError);
      assert.strictEqual(error!.message, 'Input parameter \'t\' could not be validated');
      assert.include((error!.cause as Error).message, 'the value has 2 dimension(s), but 3 were declared');
    });

    it('rejects vector columns without dimensions', async function() {
      const resolved = resolveParameter({
        type: TYPES.TVP,
        name: 't',
        output: false,
        value: { name: 'tt', columns: [{ name: 'v', type: TYPES.Vector }], rows: [] }
      }, undefined, options);

      let error: Error | undefined;
      try {
        await collect(new RpcRequestPayload('proc', [resolved], Buffer.alloc(8), options));
      } catch (err) {
        error = err as Error;
      }

      assert.instanceOf(error, InputError);
      assert.include((error!.cause as Error).message, 'must be specified with the `length` option');
    });
  });

  describe('bulk load', function() {
    function createBulkLoad() {
      const bulkLoad = new BulkLoad('vectors', undefined, options, {}, () => {});
      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('v', TYPES.Vector, { length: 3, nullable: true });
      bulkLoad.addColumn('h', TYPES.VectorFloat16, { length: 3, nullable: true });
      return bulkLoad;
    }

    it('declares vector columns in the `INSERT BULK` statement', function() {
      const bulkLoad = createBulkLoad();
      assert.strictEqual(bulkLoad.getBulkInsertSql(), 'insert bulk vectors([id] int, [v] vector(3), [h] vector(3, float16))');
      assert.strictEqual(bulkLoad.getTableCreationSql(), 'CREATE TABLE vectors(\n[id] int NOT NULL,\n[v] vector(3) NULL,\n[h] vector(3, float16) NULL\n)');
    });

    it('requires the dimensions of vector columns', function() {
      const bulkLoad = new BulkLoad('vectors', undefined, options, {}, () => {});
      assert.throws(() => bulkLoad.addColumn('v', TYPES.Vector, { nullable: true }), TypeError, 'must be specified with the `length` option');
    });

    it('serializes column metadata and rows with vector values', async function() {
      const bulkLoad = createBulkLoad();
      const data = await collect(new BulkLoadPayload(bulkLoad, [
        { id: 1, v: [1, 2.5, -3], h: [1, 2.5, -3] },
        [2, null, null],
        { id: 3, v: new Float32Array([1, 2.5, -3]), h: undefined }
      ]));

      const column = (flags: number, typeInfo: number[], name: string) => Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x00, flags, 0x00]), Buffer.from(typeInfo), bVarchar(name)
      ]);

      assert.deepEqual(data, Buffer.concat([
        // COLMETADATA
        Buffer.from([0x81, 0x03, 0x00]),
        column(0x04, [0x26, 0x04], 'id'),
        column(0x05, [0xF5, 0x14, 0x00, 0x00], 'v'),
        column(0x05, [0xF5, 0x0E, 0x00, 0x01], 'h'),
        // Rows
        Buffer.from([0xD1, 0x04, 0x01, 0x00, 0x00, 0x00]), FLOAT32_VALUE, FLOAT16_VALUE,
        Buffer.from([0xD1, 0x04, 0x02, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]),
        Buffer.from([0xD1, 0x04, 0x03, 0x00, 0x00, 0x00]), FLOAT32_VALUE, Buffer.from([0xFF, 0xFF]),
        // DONE
        Buffer.from([0xFD, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
      ]));
    });

    it('rejects row values whose dimensions do not match the column', async function() {
      let error: Error | undefined;
      try {
        await collect(new BulkLoadPayload(createBulkLoad(), [{ id: 1, v: [1, 2, 3, 4], h: null }]));
      } catch (err) {
        error = err as Error;
      }

      assert.instanceOf(error, InputError);
      assert.strictEqual(error!.message, 'Column \'v\' could not be serialized');
      assert.include((error!.cause as Error).message, 'the value has 4 dimension(s), but 3 were declared');
    });

    it('rejects invalid row values', async function() {
      let error: Error | undefined;
      try {
        await collect(new BulkLoadPayload(createBulkLoad(), [{ id: 1, v: null, h: [1, 2, 1e6] }]));
      } catch (err) {
        error = err as Error;
      }

      assert.instanceOf(error, TypeError);
      assert.include(error!.message, 'the element at index 2 is out of range for float16');
    });
  });
});
