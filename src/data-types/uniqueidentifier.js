const guidParser = require('../guid-parser');

const GUID_REGEXP = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

module.exports = {
  id: 0x24,
  type: 'GUIDN',
  name: 'UniqueIdentifier',
  dataLengthLength: 1,

  declaration: function() {
    return 'uniqueidentifier';
  },

  resolveLength: function() {
    return 16;
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(0x10);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(0x10);
      buffer.writeBuffer(new Buffer(guidParser.guidToArray(parameter.value)));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate(value) {
    if (value === undefined || value === null) {
      return null;
    }

    const stringValue = typeof value !== 'string' && typeof value.toString === 'function' ? value.toString() : value;
    if (typeof stringValue !== 'string' || stringValue.length != 36 || !GUID_REGEXP.test(stringValue)) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return stringValue;
  }
};
