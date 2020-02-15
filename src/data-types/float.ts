import { DataType } from '../data-type';
import FloatN from './floatn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const Float: DataType = {
  id: 0x3E,
  type: 'FLT8',
  name: 'Float',

  declaration: function () {
    return 'float';
  },

  writeTypeInfo: function (buffer) {
    if (buffer) {
      buffer.writeUInt8(FloatN.id);
      buffer.writeUInt8(8);
      return;
    }

    return Buffer.from([FloatN.id, 0x08]);
  },

  writeParameterData: function (buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function* (parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(1);
      buffer.writeUInt8(8, 0);
      yield buffer;

      const buffer2 = Buffer.alloc(8);
      buffer2.writeDoubleLE(parseFloat(parameter.value), 0);
      yield buffer2;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function (value): number | null | TypeError {
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
