import { assert } from 'chai';

import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { typeByName as TYPES, type DataType, type ParameterData } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import { Collation } from '../../src/collation';

type ColumnData = Omit<ParameterData, 'value'>;

const collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xd0, 0x00, 0x34]));

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

const dates = [
  new Date(Date.UTC(2020, 0, 2, 3, 4, 5, 6)),
  new Date(Date.UTC(1999, 11, 31, 23, 59, 59, 999)),
  new Date(Date.UTC(1970, 0, 1)),
  new Date(Date.UTC(1900, 0, 2, 12)),
  new Date(Date.UTC(2021, 6, 15, 12, 30)),
  '2021-06-07T08:09:10.123Z'
];

// A value from the parser, with a sub-millisecond part.
const precise = Object.assign(new Date(Date.UTC(2020, 0, 2, 3, 4, 5, 6)), { nanosecondDelta: 0.0001234 });

const decimals = [0, 1.5, -1.5, 123456.78, -123456.78, '42', 0.001];

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
  ['Date', TYPES.Date, {}, [null, ...dates]],
  ['Time(0)', TYPES.Time, { scale: 0 }, [null, ...dates, precise]],
  ['Time(3)', TYPES.Time, { scale: 3 }, [null, ...dates, precise]],
  ['Time(7)', TYPES.Time, { scale: 7 }, [null, ...dates, precise]],
  ['DateTime', TYPES.DateTime, {}, [null, ...dates, new Date(Date.UTC(2020, 0, 1, 23, 59, 59, 999))]],
  ['SmallDateTime', TYPES.SmallDateTime, {}, [null, ...dates]],
  ['DateTime2(0)', TYPES.DateTime2, { scale: 0 }, [null, ...dates, precise]],
  ['DateTime2(4)', TYPES.DateTime2, { scale: 4 }, [null, ...dates, precise]],
  ['DateTime2(7)', TYPES.DateTime2, { scale: 7 }, [null, ...dates, precise]],
  ['DateTimeOffset(0)', TYPES.DateTimeOffset, { scale: 0 }, [null, ...dates, precise]],
  ['DateTimeOffset(4)', TYPES.DateTimeOffset, { scale: 4 }, [null, ...dates, precise]],
  ['DateTimeOffset(7)', TYPES.DateTimeOffset, { scale: 7 }, [null, ...dates, precise]],
  ['Decimal(9, 2)', TYPES.Decimal, { precision: 9, scale: 2 }, [null, ...decimals]],
  ['Decimal(19, 4)', TYPES.Decimal, { precision: 19, scale: 4 }, [null, ...decimals, 123456789012345]],
  ['Decimal(28, 6)', TYPES.Decimal, { precision: 28, scale: 6 }, [null, ...decimals, 1e20]],
  ['Decimal(38, 10)', TYPES.Decimal, { precision: 38, scale: 10 }, [null, ...decimals, 1e27]],
  ['Numeric(9, 2)', TYPES.Numeric, { precision: 9, scale: 2 }, [null, ...decimals]],
  ['Numeric(19, 4)', TYPES.Numeric, { precision: 19, scale: 4 }, [null, ...decimals, 123456789012345]],
  ['Numeric(28, 6)', TYPES.Numeric, { precision: 28, scale: 6 }, [null, ...decimals, 1e20]],
  ['Numeric(38, 10)', TYPES.Numeric, { precision: 38, scale: 10 }, [null, ...decimals, 1e27]],
  ['Char(10)', TYPES.Char, { length: 10, collation }, [null, '', 'abc', 'ünï']],
  ['Char(10) without collation', TYPES.Char, { length: 10 }, [null]],
  ['NChar(10)', TYPES.NChar, { length: 10, collation }, [null, '', 'abc', 'ünï', '\u{1F600}']],
  ['Binary(3)', TYPES.Binary, { length: 3 }, [null, Buffer.from([1, 2, 3]), Buffer.from([1, 2, 3, 4, 5])]],
  ['Binary(8000)', TYPES.Binary, { length: 8000 }, [null, Buffer.alloc(8000, 7), Buffer.alloc(9000, 7)]],
  ['Text', TYPES.Text, { length: 3, collation }, [null, '', 'abc', 'ünï']],
  ['Text without collation', TYPES.Text, { length: 3 }, [null]],
  ['NText', TYPES.NText, { length: 3, collation }, [null, '', 'abc', 'ünï', '\u{1F600}']],
  ['Image', TYPES.Image, { length: 3 }, [null, Buffer.alloc(0), Buffer.from([1, 2, 3])]],
  ['UniqueIdentifier', TYPES.UniqueIdentifier, { length: 16 }, [null, '6F9619FF-8B86-D011-B42D-00C04FC964FF', '00000000-0000-0000-0000-000000000000']],
];

describe('migrated data types', function() {
  const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;

  it('Decimal and Numeric reject a value that does not fit as the legacy generator does', function() {
    for (const [type, name] of [[TYPES.Decimal, 'DECIMAL'], [TYPES.Numeric, 'NUMERIC']] as const) {
      for (const [precision, scale, value] of [[9, 2, 1e8], [19, 4, 1e16], [28, 6, 1e23], [38, 10, 1e29]] as const) {
        const column = { precision, scale };
        const message = `Value ${value} is out of range for ${name}(${precision}, ${scale}).`;
        assert.throws(() => legacyValue(type, column, value, options), RangeError, message);
        assert.throws(() => nativeValue(type, column, value, options), RangeError, message);
      }
    }
  });

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
