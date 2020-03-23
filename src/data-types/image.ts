import { DataType } from '../data-type';
const MAX = 2147483647;
const NULL = -1;

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
    const value = parameter.value;
    const buffer = Buffer.alloc(5);
    buffer.writeUInt8(this.id, 0);
    if (value === null) {
      buffer.writeInt32LE(NULL, 1);
    } else {
      buffer.writeInt32LE(value.length!, 1);
    }
    return buffer;
  },

  *generateParameterData(parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(4);
      buffer.writeInt32LE(parameter.length!, 0);
      yield buffer;

      yield parameter.value;
    } else {
      const buffer = Buffer.alloc(4);
      buffer.writeInt32LE(parameter.length!, 0);
      yield buffer;
    }
  },

  validate: function(value): null | TypeError | Buffer {
    if (value === undefined || value === null) {
      return null;
    }

    if (!Buffer.isBuffer(value) || value.length > MAX) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }
    return value;
  }
};

export default Image;
module.exports = Image;
