import { DataType } from '../data-type';
import FloatN from './floatn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const Float: DataType = {
  id: 0x3E,
  type: 'FLT8',
  name: 'Float',

  declaration: function() {
    return 'float';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(FloatN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(9);
      buffer.writeUInt8(8);
      buffer.writeDoubleLE(parseFloat(parameter.value));
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(1);
      buffer.writeUInt8(0);
      yield buffer.data;
    }
  },

  validate: function(value): number | null | TypeError {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    return value;
  }
};

export default Float;
module.exports = Float;
