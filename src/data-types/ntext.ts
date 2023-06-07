import { DataType } from '../data-type';

const NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);

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

  generateTypeInfo(parameter, _options) {
    const buffer = Buffer.alloc(10);
    buffer.writeUInt8(this.id, 0);
    buffer.writeInt32LE(parameter.length!, 1);

    if (parameter.collation) {
      parameter.collation.toBuffer().copy(buffer, 5, 0, 5);
    }

    return buffer;
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    const buffer = Buffer.alloc(4);
    buffer.writeInt32LE(Buffer.byteLength(parameter.value, 'ucs2'), 0);
    return buffer;
  },

  generateParameterData: function*(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    yield Buffer.from(parameter.value.toString(), 'ucs2');
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
