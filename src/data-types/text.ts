import { type DataType } from '../data-type';
import { encode } from '../conv';

const NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);

const Text: DataType = {
  id: 0x23,
  type: 'TEXT',
  name: 'Text',

  hasTableName: true,

  declaration: function() {
    return 'text';
  },

  resolveLength: function(parameter) {
    const value = parameter.value as Buffer | null;

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
    const value = parameter.value as Buffer | null;

    if (value == null) {
      return NULL_LENGTH;
    }

    const buffer = Buffer.alloc(4);
    buffer.writeInt32LE(value.length, 0);
    return buffer;
  },

  generateParameterData: function*(parameter, options) {
    const value = parameter.value as Buffer | null;

    if (value == null) {
      return;
    }

    yield value;
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

    return encode(value, collation.codepage);
  }
};

export default Text;
module.exports = Text;
