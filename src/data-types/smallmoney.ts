import { DataType } from '../data-type';
import MoneyN from './moneyn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const SmallMoney: DataType = {
  id: 0x7A,
  type: 'MONEY4',
  name: 'SmallMoney',

  declaration: function() {
    return 'smallmoney';
  },

  writeTypeInfo: function(buffer) {
    if(buffer) {
      buffer.writeUInt8(MoneyN.id);
      buffer.writeUInt8(4);
      return;
    }
    
    return Buffer.from([MoneyN.id, 0x04])
  },

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(5);
      let offset = 0;
      offset = buffer.writeUInt8(4, offset);
      offset = buffer.writeInt32LE(parameter.value * 10000, offset);
      yield buffer;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function(value): null | number | TypeError {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < -214748.3648 || value > 214748.3647) {
      return new TypeError('Value must be between -214748.3648 and 214748.3647.');
    }
    return value;
  }
};

export default SmallMoney;
module.exports = SmallMoney;
