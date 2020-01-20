import { DataType } from '../data-type';
import BitN from './bitn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const Bit: DataType = {
  id: 0x32,
  type: 'BIT',
  name: 'Bit',

  declaration: function() {
    return 'bit';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(BitN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function* (parameter, options) {
    if (typeof parameter.value === 'undefined' || parameter.value === null) {
      const buffer = new WritableTrackingBuffer(1);
      buffer.writeUInt8(0);
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(2);
      buffer.writeUInt8(1);
      buffer.writeUInt8(parameter.value ? 1 : 0);
      yield buffer.data;
    }
  },

  validate: function(value): null | boolean {
    if (value == null) {
      return null;
    }
    if (value) {
      return true;
    } else {
      return false;
    }
  }
};

export default Bit;
module.exports = Bit;
