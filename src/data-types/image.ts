import { type DataType } from '../data-type';

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

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeInt32LE(parameter.length!);
  },

  compileWriter() {
    return (buffer, raw) => {
      const value = Image.validate(raw, undefined) as Buffer | null;
      if (value == null) {
        buffer.writeBuffer(NULL_LENGTH);
        return;
      }

      buffer.writeInt32LE(value.length);
      buffer.writeBuffer(value);
    };
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
