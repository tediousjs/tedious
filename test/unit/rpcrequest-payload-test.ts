import { assert } from 'chai';

import RpcRequestPayload from '../../src/rpcrequest-payload';
import { typeByName as TYPES, type DataType, type Parameter, type ParameterData, resolveParameter } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import { Collation } from '../../src/collation';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from '../../src/all-headers';
import { InputError } from '../../src/errors';

const txnDescriptor = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);

/**
 * The RPC request serialization as it was before parameters were resolved
 * up front: every parameter's declaration facts are resolved and its bytes
 * generated through the `generate*` methods while the request is being
 * written. Kept here as the reference the new payload must match byte for
 * byte.
 */
function * legacyPayload(procedure: string | number, parameters: Parameter[], options: InternalConnectionOptions, collation: Collation | undefined) {
  const buffer = new WritableTrackingBuffer();
  if (options.tdsVersion >= '7_2') {
    writeToTrackingBuffer(buffer, txnDescriptor, 1);
  }

  if (typeof procedure === 'string') {
    buffer.writeUsVarchar(procedure, 'ucs2');
  } else {
    buffer.writeUShort(0xFFFF);
    buffer.writeUShort(procedure);
  }

  buffer.writeUInt16LE(0);
  yield buffer.data;

  for (let parameter of parameters) {
    // `Request.validateParameters` validated values in place before the
    // payload was built.
    parameter = { ...parameter, value: parameter.type.validate(parameter.value, collation) };

    const header = new WritableTrackingBuffer();
    header.writeBVarchar(parameter.name ? '@' + parameter.name : '', 'ucs2');
    header.writeUInt8(parameter.output ? 0x01 : 0x00);
    yield header.data;

    const type = parameter.type;
    const param: ParameterData = { value: parameter.value };

    if ((type.id & 0x30) === 0x20) {
      if (parameter.length) {
        param.length = parameter.length;
      } else if (type.resolveLength) {
        param.length = type.resolveLength(parameter);
      }
    }

    if (parameter.precision) {
      param.precision = parameter.precision;
    } else if (type.resolvePrecision) {
      param.precision = type.resolvePrecision(parameter);
    }

    if (parameter.scale) {
      param.scale = parameter.scale;
    } else if (type.resolveScale) {
      param.scale = type.resolveScale(parameter);
    }

    if (collation) {
      param.collation = collation;
    }

    yield type.generateTypeInfo(param, options);
    yield type.generateParameterLength(param, options);
    yield * type.generateParameterData(param, options);
  }
}

async function chunks(iterable: Iterable<Buffer> | AsyncIterable<Buffer>) {
  const result: Buffer[] = [];
  for await (const chunk of iterable) {
    result.push(chunk);
  }
  return result;
}

async function collect(iterable: Iterable<Buffer> | AsyncIterable<Buffer>) {
  return Buffer.concat(await chunks(iterable));
}

function parameters(withCollation: boolean): Parameter[] {
  const date = new Date(Date.UTC(2024, 1, 29, 13, 37, 42, 123));
  // These types need a collation to validate their values.
  const collated: Parameter[] = withCollation ? [
    { type: TYPES.VarChar, name: 'varchar', value: 'hello', output: false },
    { type: TYPES.VarChar, name: 'varcharMax', value: 'y'.repeat(9000), output: false },
    { type: TYPES.Char, name: 'char', value: 'ab', length: 4, output: false },
    { type: TYPES.Text, name: 'text', value: 'text value', output: false }
  ] : [];

  return [
    ...collated,
    { type: TYPES.Int, name: 'int', value: 42, output: false },
    { type: TYPES.Int, name: 'intNull', value: null, output: false },
    { type: TYPES.Int, name: 'intOut', value: 1, output: true },
    { type: TYPES.Int, name: '', value: 2, output: false },
    { type: TYPES.TinyInt, name: 'tiny', value: 200, output: false },
    { type: TYPES.SmallInt, name: 'small', value: -300, output: false },
    { type: TYPES.BigInt, name: 'big', value: '9007199254740993', output: false },
    { type: TYPES.Bit, name: 'bit', value: true, output: false },
    { type: TYPES.Float, name: 'float', value: 1.5, output: false },
    { type: TYPES.Real, name: 'real', value: -2.25, output: false },
    { type: TYPES.Money, name: 'money', value: 123.4567, output: false },
    { type: TYPES.SmallMoney, name: 'smallMoney', value: 12.34, output: false },
    { type: TYPES.Decimal, name: 'dec10', value: 123.456, precision: 10, scale: 3, output: false },
    { type: TYPES.Numeric, name: 'num38', value: -1.5, precision: 38, scale: 4, output: false },
    { type: TYPES.NVarChar, name: 'nvarchar', value: 'héllo 🎉', output: false },
    { type: TYPES.NVarChar, name: 'nvarcharMax', value: 'x'.repeat(9000), output: false },
    { type: TYPES.NVarChar, name: 'nvarcharNull', value: null, output: false },
    { type: TYPES.NVarChar, name: 'nvarcharLen', value: 'abc', length: 4001, output: false },
    { type: TYPES.NChar, name: 'nchar', value: 'ab', length: 4, output: false },
    { type: TYPES.NText, name: 'ntext', value: 'ntext value', output: false },
    { type: TYPES.VarBinary, name: 'varbinary', value: Buffer.from([1, 2, 3]), output: false },
    { type: TYPES.VarBinary, name: 'varbinaryMax', value: Buffer.alloc(9000, 7), output: false },
    { type: TYPES.VarBinary, name: 'varbinaryNull', value: null, output: false },
    { type: TYPES.Binary, name: 'binary', value: Buffer.from([9, 8]), length: 4, output: false },
    { type: TYPES.Image, name: 'image', value: Buffer.from([4, 5, 6]), output: false },
    { type: TYPES.UniqueIdentifier, name: 'guid', value: 'e062ae34-6de5-47f3-8ba3-29d25f77e71a', output: false },
    { type: TYPES.DateTime, name: 'datetime', value: date, output: false },
    { type: TYPES.SmallDateTime, name: 'smalldatetime', value: date, output: false },
    { type: TYPES.DateTime2, name: 'datetime2', value: date, scale: 7, output: false },
    { type: TYPES.DateTime2, name: 'datetime2s0', value: date, scale: 0, output: false },
    { type: TYPES.DateTimeOffset, name: 'dto', value: date, output: false },
    { type: TYPES.Date, name: 'date', value: date, output: false },
    { type: TYPES.Time, name: 'time', value: date, scale: 3, output: false },
    { type: TYPES.TVP, name: 'tvp', value: { name: 'TestType', columns: [{ name: 'id', type: TYPES.Int }, { name: 'name', type: TYPES.NVarChar, length: 20 }], rows: [[1, 'one'], [2, 'two']] }, output: false },
    { type: TYPES.TVP, name: 'tvpNull', value: null, output: false }
  ];
}

describe('RpcRequestPayload', function() {
  const collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xd0, 0x00, 0x34]));

  for (const tdsVersion of ['7_4', '7_2'] as const) {
    for (const [label, useCollation] of [['without a collation', false], ['with a collation', true]] as const) {
      for (const procedure of ['sp_test', 10] as const) {
        it(`serializes ${typeof procedure === 'string' ? 'a named procedure' : 'a procedure id'} on TDS ${tdsVersion} ${label} exactly as before`, async function() {
          const options = { tdsVersion, useUTC: true } as InternalConnectionOptions;
          const params = parameters(useCollation);

          const expected = await collect(legacyPayload(procedure, params, options, useCollation ? collation : undefined));

          const resolved = params.map((parameter) => resolveParameter(parameter, useCollation ? collation : undefined, options));
          const actual = await collect(new RpcRequestPayload(procedure, resolved, txnDescriptor, options));

          assert.deepEqual(actual, expected);
        });
      }
    }
  }

  it('serializes each parameter individually exactly as before', async function() {
    const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;

    for (const parameter of parameters(true)) {
      const expected = await collect(legacyPayload('p', [parameter], options, collation));
      const actual = await collect(new RpcRequestPayload('p', [resolveParameter(parameter, collation, options)], txnDescriptor, options));
      assert.deepEqual(actual, expected, `parameter ${parameter.name || '(unnamed)'} of type ${parameter.type.name}`);
    }
  });

  it('passes large values through by reference', async function() {
    const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;
    const value = Buffer.alloc(1024 * 1024, 0x42);
    const resolved = resolveParameter({ type: TYPES.VarBinary, name: 'blob', value, output: false }, undefined, options);

    assert.include(await chunks(new RpcRequestPayload('p', [resolved], txnDescriptor, options)), value);
  });

  it('reports serialization errors as InputError naming the parameter', async function() {
    const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;
    // A legacy-style type (no native `writeValue`) whose data generation fails.
    const type: DataType = {
      ...TYPES.Int,
      * generateParameterData(): Generator<Buffer, void> {
        throw new RangeError('boom');
      }
    };
    delete type.writeValue;
    delete type.writeTypeInfo;
    const resolved = resolveParameter({ type, name: 'broken', value: 1, output: false }, undefined, options);

    let error: unknown;
    try {
      await collect(new RpcRequestPayload('p', [resolved], txnDescriptor, options));
    } catch (e) {
      error = e;
    }
    assert.instanceOf(error, InputError);
    assert.strictEqual((error as Error).message, "Input parameter 'broken' could not be validated");
  });
});
