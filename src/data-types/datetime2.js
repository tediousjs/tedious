const YEAR_ONE = new Date(2000, 0, -730118);
const UTC_YEAR_ONE = Date.UTC(2000, 0, -730118);

module.exports = {
  id: 0x2A,
  type: 'DATETIME2N',
  name: 'DateTime2',
  hasScale: true,
  dataLengthLength: 1,

  dataLengthFromScale: function(scale) {
    switch (scale) {
      case 0:
      case 1:
      case 2:
        return 3;
      case 3:
      case 4:
        return 4;
      case 5:
      case 6:
      case 7:
        return 5;
    }
  },

  declaration: function(parameter) {
    return 'datetime2(' + (this.resolveScale(parameter)) + ')';
  },

  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale);
  },

  writeParameterData: function(buffer, parameter, options) {
    const value = parameter.value;
    if (value != null) {
      let timestamp;
      if (options.useUTC) {
        timestamp = ((value.getUTCHours() * 60 + value.getUTCMinutes()) * 60 + value.getUTCSeconds()) * 1000 + value.getUTCMilliseconds();
      } else {
        timestamp = ((value.getHours() * 60 + value.getMinutes()) * 60 + value.getSeconds()) * 1000 + value.getMilliseconds();
      }

      timestamp = timestamp * Math.pow(10, parameter.scale - 3);
      timestamp += (value.nanosecondDelta != null ? value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
      timestamp = Math.round(timestamp);

      switch (parameter.scale) {
        case 0:
        case 1:
        case 2:
          buffer.writeUInt8(6);
          buffer.writeUInt24LE(timestamp);
          break;
        case 3:
        case 4:
          buffer.writeUInt8(7);
          buffer.writeUInt32LE(timestamp);
          break;
        case 5:
        case 6:
        case 7:
          buffer.writeUInt8(8);
          buffer.writeUInt40LE(timestamp);
      }
      if (options.useUTC) {
        buffer.writeUInt24LE(Math.floor((+value - UTC_YEAR_ONE) / 86400000));
      } else {
        const dstDiff = -(value.getTimezoneOffset() - YEAR_ONE.getTimezoneOffset()) * 60 * 1000;
        buffer.writeUInt24LE(Math.floor((+value - YEAR_ONE + dstDiff) / 86400000));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate(value) {
    if (value === undefined || value === null) {
      return null;
    }

    let dateValue;
    if (value instanceof Date) {
      dateValue = value;
    } else {
      dateValue = new Date(Date.parse(value));
    }

    if (isNaN(dateValue)) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return dateValue;
  }
};
