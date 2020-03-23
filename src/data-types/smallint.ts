import { DataType } from '../data-type';
import IntN from './intn';

const SmallInt: DataType = {
  id: 0x34,
  type: 'INT2',
  name: 'SmallInt',

  declaration: function() {
    return 'smallint';
  },

  generateTypeInfo() {
    return Buffer.from([IntN.id, 0x02]);
  },

  generateParameterData: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(3);
      buffer.writeUInt8(2, 0);
      buffer.writeInt16LE(Number(parameter.value), 1);
      yield buffer;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function(value): null | number | TypeError {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = typeof value === 'number' ? value : parseInt(value);
    if (!Number.isSafeInteger(numberValue) || value < -32768 || value > 32767) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};

export default SmallInt;
module.exports = SmallInt;
