const YEAR_ONE = new Date(2000, 0, -730118);
const UTC_YEAR_ONE = Date.UTC(2000, 0, -730118);

module.exports = {
  id: 0x2A,
  type: 'DATETIME2N',
  name: 'DateTime2',
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
    if (parameter.value != null) {
      const time = new Date(+parameter.value);

      let timestamp;
      if (options.useUTC) {
        timestamp = ((time.getUTCHours() * 60 + time.getUTCMinutes()) * 60 + time.getUTCSeconds()) * 1000 + time.getUTCMilliseconds();
      } else {
        timestamp = ((time.getHours() * 60 + time.getMinutes()) * 60 + time.getSeconds()) * 1000 + time.getMilliseconds();
      }

      timestamp = timestamp * Math.pow(10, parameter.scale - 3);
      timestamp += (parameter.value.nanosecondDelta != null ? parameter.value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
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
        buffer.writeUInt24LE(Math.floor((+parameter.value - UTC_YEAR_ONE) / 86400000));
      } else {
        const dstDiff = -(parameter.value.getTimezoneOffset() - YEAR_ONE.getTimezoneOffset()) * 60 * 1000;
        buffer.writeUInt24LE(Math.floor((+parameter.value - YEAR_ONE + dstDiff) / 86400000));
      }
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
