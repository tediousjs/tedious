import { DataType } from '../data-type';
import IntN from './intn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const TinyInt: DataType = {
  id: 0x30,
  type: 'INT1',
  name: 'TinyInt',

  declaration: function() {
    return 'tinyint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(2);
      buffer.writeUInt8(1);
      buffer.writeUInt8(Number(parameter.value));
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(2);
      buffer.writeUInt8(0);
      yield buffer.data;
    }

  },

  validate: function(value): number | null | TypeError {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'number') {
      value = Number(value);
    }

    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }

    if (value < 0 || value > 255) {
      return new TypeError('Value must be between 0 and 255, inclusive.');
    }

    return value | 0;
  }
};

export default TinyInt;
module.exports = TinyInt;
