import { assert } from 'chai';

import RpcRequestPayload from '../../src/rpcrequest-payload';
import { typeByName as TYPES, type DataType, type Parameter, type ParameterData } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';

const options = { tdsVersion: '7_4' } as InternalConnectionOptions;
const txnDescriptor = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);

describe('RpcRequestPayload', function() {
  describe('parameter length resolution', function() {
    // A stub type whose id does _not_ match the legacy variable-length type
    // id bit pattern ((id & 0x30) === 0x20), like the type ids introduced
    // in TDS 7.2 and later (e.g. XMLTYPE 0xF1 or VECTORTYPE 0xF5).
    function buildModernIdType(receivedLengths: (number | undefined)[]): DataType {
      return {
        id: 0xF5,
        type: 'STUB',
        name: 'Stub',

        declaration() {
          return 'stub';
        },

        resolveLength(parameter: Parameter) {
          return (parameter.value as { length: number }).length;
        },

        generateTypeInfo(parameter: ParameterData) {
          receivedLengths.push(parameter.length);
          return Buffer.from([this.id]);
        },

        generateParameterLength(parameter: ParameterData) {
          receivedLengths.push(parameter.length);
          return Buffer.alloc(0);
        },

        * generateParameterData(parameter: ParameterData) {
          receivedLengths.push(parameter.length);
        },

        validate(value) {
          return value;
        }
      };
    }

    it('resolves the length for types with ids outside the legacy variable-length id bit pattern', function() {
      const receivedLengths: (number | undefined)[] = [];
      const parameter: Parameter = {
        type: buildModernIdType(receivedLengths),
        name: 'value',
        value: { length: 3 },
        output: false
      };

      assert.isNotEmpty([...new RpcRequestPayload('proc', [parameter], txnDescriptor, options, undefined)]);
      assert.deepEqual(receivedLengths, [3, 3, 3]);
    });

    it('prefers an explicitly specified length', function() {
      const receivedLengths: (number | undefined)[] = [];
      const parameter: Parameter = {
        type: buildModernIdType(receivedLengths),
        name: 'value',
        value: { length: 3 },
        length: 42,
        output: false
      };

      assert.isNotEmpty([...new RpcRequestPayload('proc', [parameter], txnDescriptor, options, undefined)]);
      assert.deepEqual(receivedLengths, [42, 42, 42]);
    });

    it('keeps resolving the length for legacy variable-length type ids', function() {
      const parameter: Parameter = {
        type: TYPES.VarBinary,
        name: 'value',
        value: Buffer.from([1, 2, 3]),
        output: false
      };

      const data = Buffer.concat([...new RpcRequestPayload('proc', [parameter], txnDescriptor, options, undefined)]);

      // TYPE_INFO for a varbinary(3) parameter: BIGVARBINARYTYPE with a
      // maximum length of 3 bytes, followed by the 3 byte value.
      const typeInfo = Buffer.from([0xA5, 0x03, 0x00]);
      assert.notStrictEqual(data.indexOf(typeInfo), -1);
    });
  });
});
