import { assert } from 'chai';

import { typeByName as TYPES, type DataType, type Parameter, type ParameterData, resolveParameter, writeTypeInfo, writeValue } from '../../src/data-type';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { type InternalConnectionOptions } from '../../src/connection';
import { Collation } from '../../src/collation';

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;

// The bytes the legacy contract produces for a resolved parameter.
function legacyBytes(type: DataType, data: ParameterData) {
  return {
    typeInfo: type.generateTypeInfo(data, options),
    value: Buffer.concat([type.generateParameterLength(data, options), ...type.generateParameterData(data, options)])
  };
}

function contractBytes(type: DataType, data: ParameterData) {
  const typeInfo = new WritableTrackingBuffer();
  writeTypeInfo(type, typeInfo, data, options);

  const value = new WritableTrackingBuffer();
  writeValue(type, value, data, options);

  return {
    typeInfo: typeInfo.slice(),
    value: value.slice()
  };
}

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

  describe('natively migrated types produce the legacy bytes', function() {
    const cases: [DataType, Parameter][] = [
      [TYPES.Int, { type: TYPES.Int, name: 'p', value: 123456, output: false }],
      [TYPES.Int, { type: TYPES.Int, name: 'p', value: -1, output: false }],
      [TYPES.Int, { type: TYPES.Int, name: 'p', value: null, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: 'hello', output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: 'héllo 🎉', output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: 'hello', length: 100, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: 'hello', length: 8000, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: 'x'.repeat(5000), output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: '', output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: '', length: 8000, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: null, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: null, length: 8000, output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: Buffer.from([1, 2, 3]), output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: Buffer.from([1, 2, 3]), length: 9000, output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: Buffer.alloc(9000, 7), output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: Buffer.alloc(0), output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: Buffer.alloc(0), length: 9000, output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: null, output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: null, length: 9000, output: false }]
    ];

    for (const [type, parameter] of cases) {
      const description = parameter.value === null ? 'null' : Buffer.isBuffer(parameter.value) ? `${parameter.value.length} byte buffer` : `${String(parameter.value).length} char string`;
      it(`${type.name} (${description}${parameter.length ? ', length ' + parameter.length : ''})`, function() {
        const resolved = resolveParameter(parameter, undefined, options);
        assert.deepEqual(contractBytes(type, resolved.data), legacyBytes(type, resolved.data));
      });
    }

    it('NVarChar with a collation', function() {
      const collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xd0, 0x00, 0x34]));
      const resolved = resolveParameter({ type: TYPES.NVarChar, name: 'p', value: 'hello', output: false }, collation, options);
      assert.deepEqual(contractBytes(TYPES.NVarChar, resolved.data), legacyBytes(TYPES.NVarChar, resolved.data));
    });

    it('passes large values through by reference', function() {
      const value = Buffer.alloc(64 * 1024, 7);
      const resolved = resolveParameter({ type: TYPES.VarBinary, name: 'p', value, output: false }, undefined, options);

      const buffer = new WritableTrackingBuffer();
      writeValue(TYPES.VarBinary, buffer, resolved.data, options);
      assert.include(buffer.getBuffers(), value);
    });
  });

  describe('legacy types are adapted', function() {
    it('serializes via the legacy methods', function() {
      assert.isUndefined(TYPES.BigInt.writeValue);

      const resolved = resolveParameter({ type: TYPES.BigInt, name: 'p', value: 123456789, output: false }, undefined, options);
      assert.deepEqual(contractBytes(TYPES.BigInt, resolved.data), legacyBytes(TYPES.BigInt, resolved.data));
    });
  });
});
