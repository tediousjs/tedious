const MAX = 2147483647;
const NULL = -1;

module.exports = {
  id: 0x23,
  type: 'TEXT',
  name: 'Text',
  hasCollation: true,
  hasTableName: true,
  hasTextPointerAndTimestamp: true,
  dataLengthLength: 4,

  declaration: function() {
    return 'text';
  },

  writeTypeInfo: function(buffer, parameter) {
    const value = parameter.value;

    buffer.writeUInt8(this.id);
    if (value === null) {
      buffer.writeInt32LE(NULL);
    } else {
      buffer.writeInt32LE(value.length);
    }
  },

  writeParameterData: function(buffer, parameter) {
    const value = parameter.value;

    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
    if (parameter.value != null) {
      buffer.writeInt32LE(value.length);
      buffer.writeString(value, 'ascii');
    } else {
      buffer.writeInt32LE(NULL);
    }
  },

  validate(value) {
    if (value === undefined || value === null) {
      return null;
    }

    const stringValue = typeof value !== 'string' && typeof value.toString === 'function' ? value.toString() : value;
    if (typeof stringValue !== 'string' || stringValue.length > MAX) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return stringValue;
  }
};
