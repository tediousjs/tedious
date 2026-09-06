import iconv from 'iconv-lite';
import { type DataType } from '../data-type';

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const NO_COLLATION = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);

const Char: { maximumLength: number } & DataType = {
  id: 0xAF,
  type: 'BIGCHAR',
  name: 'Char',
  maximumLength: 8000,

  declaration: function(parameter) {
    const value = parameter.value as Buffer | null;

    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (value != null) {
      length = value.length || 1;
    } else if (value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length < this.maximumLength) {
      return 'char(' + length + ')';
    } else {
      return 'char(' + this.maximumLength + ')';
    }
  },

  // ParameterData<any> is temporary solution. TODO: need to understand what type ParameterData<...> can be.
  resolveLength: function(parameter) {
    const value = parameter.value as Buffer | null;

    if (parameter.length != null) {
      return parameter.length;
    } else if (value != null) {
      return value.length || 1;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length!);
    if (parameter.collation) {
      buffer.writeBuffer(parameter.collation.toBuffer().subarray(0, 5));
    } else {
      buffer.writeBuffer(NO_COLLATION);
    }
  },

  compileWriter(column) {
    const collation = column.collation;
    return (buffer, raw) => {
      const value = Buffer.isBuffer(raw) ? raw : Char.validate(raw, collation) as Buffer | null;
      if (value == null) {
        buffer.writeBuffer(NULL_LENGTH);
        return;
      }

      buffer.writeUInt16LE(value.length);
      buffer.writeBuffer(value);
    };
  },

  validate: function(value, collation): Buffer | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError('Invalid string.');
    }

    if (!collation) {
      throw new Error('No collation was set by the server for the current connection.');
    }

    if (!collation.codepage) {
      throw new Error('The collation set by the server has no associated encoding.');
    }

    return iconv.encode(value, collation.codepage);
  }
};

export default Char;
module.exports = Char;
