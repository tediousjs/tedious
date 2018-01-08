const DecimalN = require('./decimaln');

module.exports = {
  id: 0x37,
  type: 'DECIMAL',
  name: 'Decimal',
  hasPrecision: true,
  hasScale: true,

  declaration: function(parameter) {
    return 'decimal(' + (this.resolvePrecision(parameter)) + ', ' + (this.resolveScale(parameter)) + ')';
  },

  resolvePrecision: function(parameter) {
    if (parameter.precision != null) {
      return parameter.precision;
    } else if (parameter.value === null) {
      return 1;
    } else {
      return 18;
    }
  },

  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else {
      return 0;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(DecimalN.id);
    if (parameter.precision <= 9) {
      buffer.writeUInt8(5);
    } else if (parameter.precision <= 19) {
      buffer.writeUInt8(9);
    } else if (parameter.precision <= 28) {
      buffer.writeUInt8(13);
    } else {
      buffer.writeUInt8(17);
    }
    buffer.writeUInt8(parameter.precision);
    buffer.writeUInt8(parameter.scale);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      const sign = parameter.value < 0 ? 0 : 1;
      const value = Math.round(Math.abs(parameter.value * Math.pow(10, parameter.scale)));
      if (parameter.precision <= 9) {
        buffer.writeUInt8(5);
        buffer.writeUInt8(sign);
        buffer.writeUInt32LE(value);
      } else if (parameter.precision <= 19) {
        buffer.writeUInt8(9);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
      } else if (parameter.precision <= 28) {
        buffer.writeUInt8(13);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
        buffer.writeUInt32LE(0x00000000);
      } else {
        buffer.writeUInt8(17);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
        buffer.writeUInt32LE(0x00000000);
        buffer.writeUInt32LE(0x00000000);
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate(value) {
    if (value === undefined || value === null) {
      return null;
    }

    let numberValue;
    if (typeof value === 'number') {
      numberValue = value;
    } else {
      numberValue = parseFloat(value);
    }

    if (!Number.isFinite(numberValue) || (typeof value === 'string' && value !== numberValue.toString())) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};
