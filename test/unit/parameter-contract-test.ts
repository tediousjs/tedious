import { assert } from 'chai';

import { typeByName as TYPES, type DataType, type Parameter, type ParameterData, resolveParameter, writeTypeInfo, writeValue } from '../../src/data-type';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { type InternalConnectionOptions } from '../../src/connection';

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;

// The bytes the legacy contract produces for a resolved parameter.
function legacyBytes(type: DataType, resolved: ParameterData) {
  return {
    typeInfo: type.generateTypeInfo(resolved, options),
    value: Buffer.concat([type.generateParameterLength(resolved, options), ...type.generateParameterData(resolved, options)])
  };
}

function contractBytes(type: DataType, resolved: ParameterData) {
  const typeInfo = new WritableTrackingBuffer();
  writeTypeInfo(type, typeInfo, resolved, options);

  const value = new WritableTrackingBuffer();
  const steps = writeValue(type, value, resolved, options);
  assert.isUndefined(steps, 'scalar types serialize synchronously');

  return {
    typeInfo: typeInfo.slice(),
    value: value.slice()
  };
}

describe('Parameter serialization contract', function() {
  describe('resolveParameter', function() {
    it('validates the value and resolves declaration facts', function() {
      const resolved = resolveParameter({ type: TYPES.NVarChar, name: 'p', value: 'hello', output: false }, undefined, options);
      assert.deepEqual(resolved, { value: 'hello', length: 5 });
    });

    it('prefers explicitly specified declaration facts', function() {
      const resolved = resolveParameter({ type: TYPES.NVarChar, name: 'p', value: 'hello', length: 50, output: false }, undefined, options);
      assert.deepEqual(resolved, { value: 'hello', length: 50 });
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
      assert.strictEqual(resolved.length, 42);
    });

    it('reports validation errors', function() {
      assert.throws(() => {
        resolveParameter({ type: TYPES.Int, name: 'p', value: 'not a number', output: false }, undefined, options);
      }, TypeError, 'Invalid number.');
    });
  });

  describe('natively migrated types produce the legacy bytes', function() {
    const cases: [DataType, Parameter][] = [
      [TYPES.Int, { type: TYPES.Int, name: 'p', value: 123456, output: false }],
      [TYPES.Int, { type: TYPES.Int, name: 'p', value: null, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: 'hello', output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: 'hello', length: 100, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: 'hello', length: 8000, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: '', length: 8000, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: null, output: false }],
      [TYPES.NVarChar, { type: TYPES.NVarChar, name: 'p', value: null, length: 8000, output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: Buffer.from([1, 2, 3]), output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: Buffer.from([1, 2, 3]), length: 9000, output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: Buffer.alloc(0), length: 9000, output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: null, output: false }],
      [TYPES.VarBinary, { type: TYPES.VarBinary, name: 'p', value: null, length: 9000, output: false }]
    ];

    for (const [type, parameter] of cases) {
      it(`${type.name} (${parameter.value === null ? 'null' : 'value'}${parameter.length ? ', length ' + parameter.length : ''})`, function() {
        const resolved = resolveParameter(parameter, undefined, options);
        assert.deepEqual(contractBytes(type, resolved), legacyBytes(type, resolved));
      });
    }
  });

  describe('legacy types are adapted', function() {
    it('serializes via the legacy methods', function() {
      assert.isUndefined(TYPES.BigInt.writeValue);

      const resolved = resolveParameter({ type: TYPES.BigInt, name: 'p', value: 123456789, output: false }, undefined, options);
      assert.deepEqual(contractBytes(TYPES.BigInt, resolved), legacyBytes(TYPES.BigInt, resolved));
    });
  });
});
