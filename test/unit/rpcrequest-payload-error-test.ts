import { assert } from 'chai';

import RpcRequestPayload from '../../src/rpcrequest-payload';
import { InputError } from '../../src/errors';
import { type DataType, type Parameter } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';

const options = { tdsVersion: '7_4' } as InternalConnectionOptions;
const txnDescriptor = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);

describe('RpcRequestPayload', function() {
  describe('parameter serialization errors', function() {
    function buildType(overrides: Partial<DataType>): DataType {
      return {
        id: 0xA5,
        type: 'STUB',
        name: 'Stub',

        declaration() {
          return 'stub';
        },

        generateTypeInfo() {
          return Buffer.alloc(1);
        },

        generateParameterLength() {
          return Buffer.alloc(0);
        },

        * generateParameterData() { },

        validate(value) {
          return value;
        },

        ...overrides
      };
    }

    function collect(type: DataType) {
      const parameter: Parameter = { type: type, name: 'foo', value: null, output: false };
      const payload = new RpcRequestPayload('proc', [parameter], txnDescriptor, options, undefined);

      return [...payload];
    }

    it('wraps errors thrown while generating the type info', function() {
      const cause = new RangeError('out of range');
      const type = buildType({
        generateTypeInfo() {
          throw cause;
        }
      });

      let error;
      try {
        collect(type);
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, InputError);
      assert.match(error.message, /Input parameter 'foo' could not be validated/);
      assert.strictEqual(error.cause, cause);
    });

    it('wraps errors thrown while generating the parameter length', function() {
      const cause = new RangeError('out of range');
      const type = buildType({
        generateParameterLength() {
          throw cause;
        }
      });

      let error;
      try {
        collect(type);
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, InputError);
      assert.strictEqual(error.cause, cause);
    });

    it('wraps errors thrown while constructing the parameter data iterator', function() {
      // `generateParameterData` does not have to be implemented as a
      // generator function - a plain function performing synchronous setup
      // before returning an iterator throws at call time.
      const cause = new TypeError('invalid value');
      const type = buildType({
        generateParameterData(): Generator<Buffer, void> {
          throw cause;
        }
      });

      let error;
      try {
        collect(type);
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, InputError);
      assert.strictEqual(error.cause, cause);
    });

    it('wraps errors thrown while generating the parameter data', function() {
      const cause = new TypeError('invalid value');
      const type = buildType({
        * generateParameterData(): Generator<Buffer, void> {
          throw cause;
        }
      });

      let error;
      try {
        collect(type);
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, InputError);
      assert.strictEqual(error.cause, cause);
    });
  });
});
