const UTC_YEAR_ONE = Date.UTC(2000, 0, -730118);

module.exports = {
  id: 0x2B,
  type: 'DATETIMEOFFSETN',
  name: 'DateTimeOffset',
  hasScale: true,
  dataLengthLength: 1,

  fromBuffer(buffer, offset, scale, { useUTC }) {
    let value;
    if (0 <= scale && scale <= 2) {
      value = buffer.readUIntLE(offset, 3);
      offset += 3;
    } else if (3 <= scale && scale <= 4) {
      value = buffer.readUIntLE(offset, 4);
      offset += 4;
    } else if (5 <= scale && scale <= 7) {
      value = buffer.readUIntLE(offset, 5);
      offset += 5;
    } else {

    }

    const days = buffer.readUIntLE(offset, 3);
    offset += 3;

    // TODO: Do something with this offset
    // const timezoneOffset = buffer.readInt16LE(offset);

    if (scale < 7) {
      for (let i = scale; i < 7; i++) {
        value *= 10;
      }
    }

    let date;
    if (useUTC) {
      date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, value / 10000));
    } else {
      date = new Date(2000, 0, days - 730118, 0, 0, 0, value / 10000);
    }

    Object.defineProperty(date, 'nanosecondsDelta', {
      enumerable: false,
      value: (value % 10000) / Math.pow(10, 7)
    });

    return date;
  },

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
    return 'datetimeoffset(' + (this.resolveScale(parameter)) + ')';
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
  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      const time = new Date(+parameter.value);
      time.setUTCFullYear(1970);
      time.setUTCMonth(0);
      time.setUTCDate(1);

      let timestamp = time * Math.pow(10, parameter.scale - 3);
      timestamp += (parameter.value.nanosecondDelta != null ? parameter.value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
      timestamp = Math.round(timestamp);

      const offset = -parameter.value.getTimezoneOffset();
      switch (parameter.scale) {
        case 0:
        case 1:
        case 2:
          buffer.writeUInt8(8);
          buffer.writeUInt24LE(timestamp);
          break;
        case 3:
        case 4:
          buffer.writeUInt8(9);
          buffer.writeUInt32LE(timestamp);
          break;
        case 5:
        case 6:
        case 7:
          buffer.writeUInt8(10);
          buffer.writeUInt40LE(timestamp);
      }
      buffer.writeUInt24LE(Math.floor((+parameter.value - UTC_YEAR_ONE) / 86400000));
      buffer.writeInt16LE(offset);
    } else {
      buffer.writeUInt8(0);
    }
  },
  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (!(value instanceof Date)) {
      value = Date.parse(value);
    }
    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }
    return value;
  }
};
