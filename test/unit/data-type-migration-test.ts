import { assert } from 'chai';

import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { typeByName as TYPES, type DataType, type ParameterData } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';

type ColumnData = Omit<ParameterData, 'value'>;

function parameter(column: ColumnData, value: unknown): ParameterData {
  return { ...column, value };
}

// The bytes the legacy `generateTypeInfo` gives.
function legacyTypeInfo(type: DataType, column: ColumnData, options: InternalConnectionOptions) {
  return type.generateTypeInfo(parameter(column, null), options);
}

function nativeTypeInfo(type: DataType, column: ColumnData, options: InternalConnectionOptions) {
  const buffer = new WritableTrackingBuffer();
  type.writeTypeInfo!(buffer, parameter(column, null), options);
  return buffer.data;
}

// The bytes the legacy `generateParameterLength` and `generateParameterData`
// give for a validated value.
function legacyValue(type: DataType, column: ColumnData, validated: unknown, options: InternalConnectionOptions) {
  const cell = parameter(column, validated);
  return Buffer.concat([type.generateParameterLength(cell, options), ...type.generateParameterData(cell, options)]);
}

function nativeValue(type: DataType, column: ColumnData, validated: unknown, options: InternalConnectionOptions) {
  const buffer = new WritableTrackingBuffer();
  assert.isUndefined(type.writeValue!(buffer, parameter(column, validated), options));
  return buffer.data;
}

type Case = [string, DataType, ColumnData, unknown[]];

// Every migrated type with inputs as a user would pass them.
const cases: Case[] = [
  ['TinyInt', TYPES.TinyInt, {}, [null, undefined, 0, 1, 255, '42', 3.9]],
  ['SmallInt', TYPES.SmallInt, {}, [null, 0, 1, -1, 32767, -32768, '42', 3.9]],
  ['BigInt', TYPES.BigInt, {}, [null, 0, 1, -1, 9007199254740991, '42', 9223372036854775807n, -9223372036854775808n]],
  ['Bit', TYPES.Bit, {}, [null, true, false, 1, 0, 'x', '']],
  ['Real', TYPES.Real, {}, [null, 0, 1.5, -2.25, '3.5', 1e10, 3.4e38]],
  ['Float', TYPES.Float, {}, [null, 0, 1.5, -2.25, '3.5', 1e300, Number.MAX_VALUE]],
  ['Money', TYPES.Money, {}, [null, 0, 1.2345, -1.2345, '4.5', 123456789.5, -123456789.5, 922337203685477.5]],
  ['SmallMoney', TYPES.SmallMoney, {}, [null, 0, 1.2345, -1.2345, '4.5', 214748.36, -214748.36]],
];

describe('migrated data types', function() {
  for (const [name, type, column, values] of cases) {
    describe(name, function() {
      it('has the write contract', function() {
        assert.isFunction(type.writeTypeInfo);
        assert.isFunction(type.writeValue);
      });

      for (const useUTC of [true, false]) {
        describe(`with useUTC ${useUTC}`, function() {
          const options = { tdsVersion: '7_4', useUTC } as InternalConnectionOptions;

          it('writes the type info generateTypeInfo gives', function() {
            assert.deepEqual(nativeTypeInfo(type, column, options), legacyTypeInfo(type, column, options));
          });

          it('writes the value generateParameterLength and generateParameterData give', function() {
            for (const value of values) {
              const validated = type.validate(value, column.collation);
              assert.deepEqual(nativeValue(type, column, validated, options), legacyValue(type, column, validated, options), `value ${String(value).slice(0, 20)}`);
            }
          });
        });
      }
    });
  }
});
