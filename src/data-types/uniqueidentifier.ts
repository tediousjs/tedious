import { DataType } from '../data-type';
import { guidToArray } from '../guid-parser';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';
const GUID_REGEXP = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

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

  generateParameterData: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(1);
      buffer.writeUInt8(0x10);
      buffer.writeBuffer(Buffer.from(guidToArray(parameter.value)));
      yield buffer.data;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function(value): string | null | TypeError {
    if (value === undefined || value === null) {
      return null;
    }

    const stringValue = typeof value !== 'string' && typeof value.toString === 'function' ? value.toString() : value;
    if (typeof stringValue !== 'string' || stringValue.length !== 36 || !GUID_REGEXP.test(stringValue)) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return stringValue;
  }
};

export default UniqueIdentifier;
module.exports = UniqueIdentifier;
