import { type DataType } from '../data-type';
const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const PLP_TERMINATOR = Buffer.from([0x00, 0x00, 0x00, 0x00]);
const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

const Json: DataType = {
  id: 0xF4,
  type: 'JSON',
  name: 'JSON',

  declaration: (parameter) => {
    return 'json';
  },

  generateTypeInfo(parameter) {
    return Buffer.from([this.id]);
  },

  generateParameterLength: (parameter, options) => {
    const value = parameter.value as Buffer | null;
    if (value == null) {
      return MAX_NULL_LENGTH;
    }
    return UNKNOWN_PLP_LEN;
  },

  generateParameterData: function* (parameter, options) {
    const value = parameter.value as Buffer | null;
    if (value == null) {
      return;
    }

    if (value.length > 0) {
      const buffer = Buffer.alloc(4);
      buffer.writeUInt32LE(value.length, 0);
      yield buffer;
      yield value;
    }

    yield PLP_TERMINATOR;
  },

  validate: (value, collation): Buffer | null => {
    if (value == null) {
      return null;
    }

    if (typeof value === 'string') {
      JSON.parse(value);
      return Buffer.from(value, 'utf-8');
    }

    if (Buffer.isBuffer(value)) {
      throw new TypeError('Invalid JSON value.');
    }

    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('Invalid JSON value.');
    }

    return Buffer.from(serialized, 'utf-8');
  }
};

export default Json;
module.exports = Json;
