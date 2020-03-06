import { DataType } from '../data-type';

const Text: DataType = {
  id: 0x23,
  type: 'TEXT',
  name: 'Text',

  hasTableName: true,

  declaration: function() {
    return 'text';
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
    const buffer = Buffer.alloc(5);
    buffer.writeUInt8(this.id, 0);
    buffer.writeInt32LE(parameter.length!, 1);
    return buffer;
  },

  generateParameterData: function*(parameter, options) {
    yield Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);

    if (parameter.value != null) {
      const buffer = Buffer.alloc(4);
      buffer.writeInt32LE(parameter.length!, 0);
      yield buffer;

      yield Buffer.from(parameter.value.toString(), 'ascii');
    } else {
      const buffer = Buffer.alloc(4);
      buffer.writeInt32LE(parameter.length!, 0);
      yield buffer;
    }
  },

  validate: function(value): string | null | TypeError {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};


export default Text;
module.exports = Text;
