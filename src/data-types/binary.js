const NULL = (1 << 16) - 1;

module.exports = {
  id: 0xAD,
  type: 'BIGBinary',
  name: 'Binary',
  dataLengthLength: 2,
  maximumLength: 8000,

  declaration: function(parameter) {
    var length;
    if (parameter.length) {
      length = parameter.length;
    } else if (parameter.value != null) {
      length = parameter.value.length || 1;
    } else if (parameter.value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }
    return 'binary(' + length + ')';
  },

  resolveLength: function(parameter) {
    if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt16LE(parameter.length);
      buffer.writeBuffer(parameter.value.slice(0, Math.min(parameter.length, this.maximumLength)));
    } else {
      buffer.writeUInt16LE(NULL);
    }
    cb();
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }
    return value;
  }
};
