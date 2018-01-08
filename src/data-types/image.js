const MAX = 2147483647;
const NULL = -1;

module.exports = {
  id: 0x22,
  type: 'IMAGE',
  name: 'Image',
  hasTableName: true,
  hasTextPointerAndTimestamp: true,
  dataLengthLength: 4,

  declaration: function() {
    return 'image';
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

    if (value === null) {
      buffer.writeInt32LE(NULL);
    } else {
      buffer.writeInt32LE(value.length);
      buffer.writeBuffer(value);
    }
  },

  validate(value) {
    if (value === undefined || value === null) {
      return null;
    }

    if (!Buffer.isBuffer(value) || value.length > MAX) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return value;
  }
};
