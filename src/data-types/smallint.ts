import { DataType } from '../data-type';
import IntN from './intn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const SmallInt: DataType = {
  id: 0x34,
  type: 'INT2',
  name: 'SmallInt',

  declaration: function() {
    return 'smallint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(2);
  },

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(3);
      buffer.writeUInt8(2);
      buffer.writeInt16LE(Number(parameter.value));
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(3);
      buffer.writeUInt8(0);
      yield buffer.data;
    }
  },

  validate: function(value): null | number | TypeError {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'number') {
      value = Number(value);
    }

    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }

    if (value < -32768 || value > 32767) {
      return new TypeError('Value must be between -32768 and 32767, inclusive.');
    }

    return value | 0;
  }
};

export default SmallInt;
module.exports = SmallInt;
