import { type DataType } from '../data-type';
import { writePlpValue } from './plp-stream';

const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

const Json: DataType = {
  id: 0xF4,
  type: 'JSON',
  name: 'JSON',

  declaration: function() {
    return 'json';
  },

  writeTypeInfo(buffer) {
    buffer.writeUInt8(this.id);
  },

  writeValue(buffer, parameter) {
    if (parameter.value == null) {
      buffer.writeBuffer(MAX_NULL_LENGTH);
      return;
    }

    // `validate` serialized and encoded the value.
    writePlpValue(buffer, parameter.value as Buffer);
  },

  validate: function(value): Buffer | null {
    if (value == null) {
      return null;
    }

    if (typeof value === 'string') {
      JSON.parse(value);
      return Buffer.from(value, 'utf8');
    }

    if (Buffer.isBuffer(value)) {
      throw new TypeError('Invalid JSON value.');
    }

    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('Invalid JSON value.');
    }

    return Buffer.from(serialized, 'utf8');
  }
};

export default Json;
module.exports = Json;
