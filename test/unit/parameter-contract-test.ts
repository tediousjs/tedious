import { assert } from 'chai';

import { typeByName as TYPES, type DataType, resolveParameter } from '../../src/data-type';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { type InternalConnectionOptions } from '../../src/connection';
import { Collation } from '../../src/collation';
import { InputError } from '../../src/errors';

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

    describe('with an explicit length', function() {
      function resolve(type: DataType, value: unknown, length: number) {
        return resolveParameter({ type, name: 'p', value, length, output: false }, undefined, options);
      }

      it('rejects a length a type cannot be declared with', function() {
        const cases: [DataType, unknown, number][] = [
          [TYPES.Binary, Buffer.from('JP'), 0],
          [TYPES.Binary, Buffer.from('JP'), NaN],
          [TYPES.Binary, Buffer.from('JP'), -1],
          [TYPES.Binary, Buffer.from('JP'), 1.5],
          [TYPES.Binary, Buffer.from('JP'), 8001],
          [TYPES.Binary, Buffer.from('JP'), Infinity],
          [TYPES.Binary, null, 0],
          [TYPES.VarBinary, Buffer.from('JP'), 0],
          [TYPES.VarBinary, Buffer.from('JP'), 1.5],
          [TYPES.Char, 'JP', 0],
          [TYPES.Char, 'JP', NaN],
          [TYPES.Char, 'JP', 8001],
          [TYPES.NChar, 'JP', 4001],
          [TYPES.VarChar, 'JP', 0],
          [TYPES.NVarChar, 'JP', 0],
          [TYPES.NVarChar, 'JP', -1]
        ];

        for (const [type, value, length] of cases) {
          assert.throws(() => resolve(type, value, length), InputError, `Invalid length ${length} for ${type.name}`);
        }
      });

      it('accepts a length within the type\'s range', function() {
        assert.strictEqual(resolve(TYPES.Binary, Buffer.from('JP'), 1).data.length, 1);
        assert.strictEqual(resolve(TYPES.Binary, Buffer.from('JP'), 8000).data.length, 8000);
        assert.strictEqual(resolve(TYPES.NChar, 'JP', 4000).data.length, 4000);
        assert.strictEqual(resolve(TYPES.NVarChar, 'JP', 1).data.length, 1);
      });

      it('accepts a length above the maximum, or NaN, for a type with a max form', function() {
        assert.strictEqual(resolve(TYPES.VarBinary, Buffer.from('JP'), Infinity).data.length, Infinity);
        assert.strictEqual(resolve(TYPES.VarBinary, Buffer.from('JP'), 9000).data.length, 9000);
        assert.isNaN(resolve(TYPES.VarBinary, Buffer.from('JP'), NaN).data.length);
        assert.isNaN(resolve(TYPES.NVarChar, 'JP', NaN).data.length);
      });

      it('leaves a length on a type that is not declared with one alone', function() {
        assert.strictEqual(resolve(TYPES.Int, 1, 0).data.value, 1);
      });

      it('rejects an invalid length on a TVP column', function() {
        const value = { name: 't', columns: [{ name: 'c', type: TYPES.Binary, length: 0 }], rows: [[Buffer.from('JP')]] };
        assert.throws(() => resolveParameter({ type: TYPES.TVP, name: 'p', value, output: false }, undefined, options), InputError, 'TVP column \'c\' has an invalid length');
      });
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
