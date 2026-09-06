import { type DataType } from '../data-type';

const NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
const NO_COLLATION = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);

const NText: DataType = {
  id: 0x63,
  type: 'NTEXT',
  name: 'NText',

  hasTableName: true,

  declaration: function() {
    return 'ntext';
  },

  resolveLength: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    if (value != null) {
      return value.length;
    } else {
      return -1;
    }
  },

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeInt32LE(parameter.length!);
    if (parameter.collation) {
      buffer.writeBuffer(parameter.collation.toBuffer().subarray(0, 5));
    } else {
      buffer.writeBuffer(NO_COLLATION);
    }
  },

  writeValue(buffer, parameter) {
    if (parameter.value == null) {
      buffer.writeBuffer(NULL_LENGTH);
      return;
    }

    const value = String(parameter.value);
    buffer.writeInt32LE(value.length * 2);
    buffer.writeString(value, 'ucs2');
  },

  validate: function(value): string | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError('Invalid string.');
    }

    return value;
  }
};

export default NText;
module.exports = NText;
