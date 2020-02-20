import { DataType } from '../data-type';
import { guidToArray } from '../guid-parser';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const UniqueIdentifier: DataType = {
  id: 0x24,
  type: 'GUIDN',
  name: 'UniqueIdentifier',

  declaration: function() {
    return 'uniqueidentifier';
  },

  resolveLength: function() {
    return 16;
  },

  generateTypeInfo() {
    return Buffer.from([this.id, 0x10]);
  },

  generateParameterData: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(1);
      buffer.writeUInt8(0x10);
      buffer.writeBuffer(Buffer.from(guidToArray(parameter.value)));
      yield buffer.data;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function(value): string | null | TypeError {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};

export default UniqueIdentifier;
module.exports = UniqueIdentifier;
