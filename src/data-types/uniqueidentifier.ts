import { DataType } from '../data-type';
import { guidToArray } from '../guid-parser';

const NULL_LENGTH = Buffer.from([0x00]);
const DATA_LENGTH = Buffer.from([0x10]);

const UniqueIdentifier: DataType = {
  id: 0x24,
  type: 'GUIDN',
  name: 'UniqueIdentifier',

  declaration: function() {
    return 'uniqueidentifier';
  },

  resolveLength: function() {
    return 16;
  },

  generateTypeInfo() {
    return Buffer.from([this.id, 0x10]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    return DATA_LENGTH;
  },

  generateParameterData: function*(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    yield Buffer.from(guidToArray(parameter.value));
  },

  validate: function(value): string | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError('Invalid string.');
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new TypeError('Invalid GUID.');
    }

    return value;
  }
};

export default UniqueIdentifier;
module.exports = UniqueIdentifier;
