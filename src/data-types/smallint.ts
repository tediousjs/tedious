import { DataType } from '../data-type';
import IntN from './intn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const SmallInt: DataType = {
  id: 0x34,
  type: 'INT2',
  name: 'SmallInt',

  declaration: function () {
    return 'smallint';
  },

  writeTypeInfo: function (buffer) {
    if (buffer) {
      buffer.writeUInt8(IntN.id);
      buffer.writeUInt8(2);
      return;
    }

    return Buffer.from([IntN.id, 0x02]);
  },

  writeParameterData: function (buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function* (parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(3);
      let offset = 0;
      offset = buffer.writeUInt8(2, offset);
      offset = buffer.writeInt16LE(Number(parameter.value), offset);
      yield buffer;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function (value): null | number | TypeError {
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
