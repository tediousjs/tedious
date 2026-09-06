import { type DataType } from '../data-type';
import { guidToArray } from '../guid-parser';

const TYPE_INFO = Buffer.from([0x24, 0x10]);

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

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  writeValue(buffer, parameter) {
    const value = parameter.value as string | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(0x10);
    for (const byte of guidToArray(value)) {
      buffer.writeUInt8(byte);
    }
  },

  validate: function(value): string | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError('Invalid string.');
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new TypeError('Invalid GUID.');
    }

    return value;
  }
};

export default UniqueIdentifier;
module.exports = UniqueIdentifier;
