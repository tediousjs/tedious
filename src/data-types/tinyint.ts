import { DataType } from '../data-type';
import IntN from './intn';

const TinyInt: DataType = {
  id: 0x30,
  type: 'INT1',
  name: 'TinyInt',

  declaration: function() {
    return 'tinyint';
  },

  generateTypeInfo() {
    return Buffer.from([IntN.id, 0x01]);
  },

  generateParameterData: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(2);
      let offset = 0;
      offset = buffer.writeUInt8(1, offset);
      buffer.writeUInt8(Number(parameter.value), offset);
      yield buffer;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function(value): number | null | TypeError {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = typeof value === 'number' ? value : parseInt(value);
    if (!Number.isSafeInteger(numberValue) || value < 0 || value > 255) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};

export default TinyInt;
module.exports = TinyInt;
