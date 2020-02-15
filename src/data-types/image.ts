import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const Image: DataType = {
  id: 0x22,
  type: 'IMAGE',
  name: 'Image',
  hasTableName: true,

  declaration: function () {
    return 'image';
  },

  resolveLength: function (parameter) {
    if (parameter.value != null) {
      const value = parameter.value as any; // TODO: Temporary solution. Replace 'any' more with specific type;
      return value.length;
    } else {
      return -1;
    }
  },

  writeTypeInfo: function (buffer, parameter) {
    if (buffer) {
      buffer.writeUInt8(this.id);
      buffer.writeInt32LE(parameter.length);
      return;
    }

    const buff = Buffer.from([this.id]);

    const buff2 = Buffer.alloc(4);
    buff2.writeInt32LE(parameter.length!, 0);

    return Buffer.concat([buff, buff2], buff.length + buff2.length);
  },

  writeParameterData: function (buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function* (parameter, options) {
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

  validate: function (value): null | TypeError | Buffer {
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
