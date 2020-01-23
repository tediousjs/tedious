import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;

const NVarChar: { maximumLength: number } & DataType = {
  id: 0xE7,
  type: 'NVARCHAR',
  name: 'NVarChar',
  maximumLength: 4000,

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (value != null) {
      length = value.toString().length || 1;
    } else if (value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length <= this.maximumLength) {
      return 'nvarchar(' + length + ')';
    } else {
      return 'nvarchar(max)';
    }
  },

  resolveLength: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    if (parameter.length != null) {
      return parameter.length;
    } else if (value != null) {
      if (Buffer.isBuffer(value)) {
        return (value.length / 2) || 1;
      } else {
        return value.toString().length || 1;
      }
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length! * 2);
    } else {
      buffer.writeUInt16LE(MAX);
    }
    buffer.writeBuffer(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]));
  },

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(0);
      if (parameter.length! <= this.maximumLength) {
        buffer.writeUsVarbyte(parameter.value, 'ucs2');
        yield buffer.data;
      } else {
        buffer.writePLPBody(parameter.value, 'ucs2');
        yield buffer.data;
      }
    } else if (parameter.length! <= this.maximumLength) {
      const buffer = new WritableTrackingBuffer(2);
      buffer.writeUInt16LE(NULL);
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(4);
      buffer.writeUInt32LE(0xFFFFFFFF);
      buffer.writeUInt32LE(0xFFFFFFFF);
      yield buffer.data;
    }
  },

  validate: function(value): null | string | TypeError {
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

export default NVarChar;
module.exports = NVarChar;
