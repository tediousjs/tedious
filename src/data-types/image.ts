import { DataType } from '../data-type';

const NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);

const Image: DataType = {
  id: 0x22,
  type: 'IMAGE',
  name: 'Image',
  hasTableName: true,

  declaration: function() {
    return 'image';
  },

  resolveLength: function(parameter) {
    if (parameter.value != null) {
      const value = parameter.value as any; // TODO: Temporary solution. Replace 'any' more with specific type;
      return value.length;
    } else {
      return -1;
    }
  },

  generateTypeInfo(parameter) {
    const buffer = Buffer.alloc(5);
    buffer.writeUInt8(this.id, 0);
    buffer.writeInt32LE(parameter.length!, 1);
    return buffer;
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    const buffer = Buffer.alloc(4);
    buffer.writeInt32LE(parameter.value.length!, 0);
    return buffer;
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    yield parameter.value;
  },

  validate: function(value): null | Buffer {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      throw new TypeError('Invalid buffer.');
    }
    return value;
  }
};

export default Image;
module.exports = Image;
