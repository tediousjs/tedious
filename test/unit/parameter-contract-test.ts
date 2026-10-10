import { assert } from 'chai';

import { typeByName as TYPES, type DataType, resolveParameter } from '../../src/data-type';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { type InternalConnectionOptions } from '../../src/connection';
import { Collation } from '../../src/collation';

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;

describe('Parameter serialization contract', function() {
  describe('resolveParameter', function() {
    it('validates the value and resolves declaration facts', function() {
      const resolved = resolveParameter({ type: TYPES.NVarChar, name: 'p', value: 'hello', output: false }, undefined, options);
      assert.deepEqual(resolved, { name: 'p', output: false, type: TYPES.NVarChar, data: { value: 'hello', length: 5 } });
    });

    it('prefers explicitly specified declaration facts', function() {
      const resolved = resolveParameter({ type: TYPES.NVarChar, name: 'p', value: 'hello', length: 50, output: false }, undefined, options);
      assert.deepEqual(resolved.data, { value: 'hello', length: 50 });
    });

    it('keeps an explicitly specified zero', function() {
      const resolved = resolveParameter({ type: TYPES.DateTime2, name: 'p', value: new Date(0), scale: 0, output: false }, undefined, options);
      assert.strictEqual(resolved.data.scale, 0);

      const unresolved = resolveParameter({ type: TYPES.DateTime2, name: 'p', value: new Date(0), output: false }, undefined, options);
      assert.strictEqual(unresolved.data.scale, 7);
    });

    it('resolves a Binary length of 0 or NaN from the value, matching its declaration', function() {
      const value = Buffer.from('JP');
      for (const length of [undefined, 0, NaN]) {
        const parameter = { type: TYPES.Binary, name: 'p', value, length, output: false };
        const resolved = resolveParameter(parameter, undefined, options);
        assert.deepEqual(resolved.data, { value, length: 2 });
        assert.strictEqual(TYPES.Binary.declaration(parameter), 'binary(2)');

        const buffer = new WritableTrackingBuffer();
        TYPES.Binary.writeTypeInfo(buffer, resolved.data, options);
        TYPES.Binary.writeValue(buffer, resolved.data, options);
        assert.deepEqual(buffer.data, Buffer.from('ad020002004a50', 'hex'));
      }

      const explicit = resolveParameter({ type: TYPES.Binary, name: 'p', value, length: 4, output: false }, undefined, options);
      assert.strictEqual(explicit.data.length, 4);

      const nullValue = resolveParameter({ type: TYPES.Binary, name: 'p', value: null, length: 0, output: false }, undefined, options);
      assert.deepEqual(nullValue.data, { value: null, length: 8000 });
    });

    it('declares an empty Binary value as binary(1), never a zero length', function() {
      for (const length of [undefined, 0, NaN]) {
        const parameter = { type: TYPES.Binary, name: 'p', value: Buffer.alloc(0), length, output: false };
        const resolved = resolveParameter(parameter, undefined, options);
        assert.strictEqual(TYPES.Binary.declaration(parameter), 'binary(1)');

        const buffer = new WritableTrackingBuffer();
        TYPES.Binary.writeTypeInfo(buffer, resolved.data, options);
        TYPES.Binary.writeValue(buffer, resolved.data, options);
        assert.deepEqual(buffer.data, Buffer.from('ad01000000', 'hex'));
      }
    });

    it('sends the actual Binary data length when it is shorter than the declared length', function() {
      const resolved = resolveParameter({ type: TYPES.Binary, name: 'p', value: Buffer.from('JP'), length: 4, output: false }, undefined, options);

      const buffer = new WritableTrackingBuffer();
      TYPES.Binary.writeTypeInfo(buffer, resolved.data, options);
      TYPES.Binary.writeValue(buffer, resolved.data, options);
      assert.deepEqual(buffer.data, Buffer.from('ad040002004a50', 'hex'));
    });

    it('resolves lengths for types with ids outside the legacy variable-length id bit pattern', function() {
      const type: DataType = {
        ...TYPES.VarBinary,
        id: 0xF5,
        resolveLength() {
          return 42;
        }
      };
      const resolved = resolveParameter({ type, name: 'p', value: null, output: false }, undefined, options);
      assert.strictEqual(resolved.data.length, 42);
    });

    it('validates with the collation only, as callers did before', function() {
      const received: unknown[][] = [];
      const type: DataType = {
        ...TYPES.Int,
        validate(...args: unknown[]) {
          received.push(args);
          return 1;
        }
      };
      const collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xd0, 0x00, 0x34]));
      resolveParameter({ type, name: 'p', value: 1, output: false }, collation, options);
      assert.deepEqual(received, [[1, collation]]);
    });

    it('reports validation errors', function() {
      assert.throws(() => {
        resolveParameter({ type: TYPES.Int, name: 'p', value: 'not a number', output: false }, undefined, options);
      }, TypeError, 'Invalid number.');
    });

    it('delegates to a type that resolves natively', function() {
      const type: DataType = {
        ...TYPES.Int,
        resolve(parameter) {
          return { value: 7, length: 99 };
        }
      };
      const resolved = resolveParameter({ type, name: 'p', value: 1, output: true }, undefined, options);
      assert.deepEqual(resolved, { name: 'p', output: true, type, data: { value: 7, length: 99 } });
    });
  });

  describe('writeValue', function() {
    it('passes large values through by reference', function() {
      const value = Buffer.alloc(64 * 1024, 7);
      const resolved = resolveParameter({ type: TYPES.VarBinary, name: 'p', value, output: false }, undefined, options);

      const buffer = new WritableTrackingBuffer();
      TYPES.VarBinary.writeValue(buffer, resolved.data, options);
      assert.include(buffer.getBuffers(), value);
    });
  });
});
