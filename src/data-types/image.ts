import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

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

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeInt32LE(parameter.length);
  },

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(4);
      buffer.writeInt32LE(parameter.length!);
      buffer.writeBuffer(parameter.value);
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(4);
      buffer.writeInt32LE(parameter.length!);
      yield buffer.data;
    }
  },

  validate: function(value): null | TypeError | Buffer {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }
    return value;
  }
};

export default Image;
module.exports = Image;
