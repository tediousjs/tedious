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

  resolveLength: function(parameter) {
    if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return -1;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeInt32LE(parameter.length);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    buffer.writeBuffer(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]));
    if (parameter.value != null) {
      buffer.writeInt32LE(parameter.length);
      buffer.writeString(parameter.value.toString(), 'ascii');
    } else {
      buffer.writeInt32LE(parameter.length);
    }
    cb();
  },

  validate: function(value) {
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
