import { DataType } from '../data-type';
const NumericN = require('./numericn');

const Numeric: DataType & { resolveScale: NonNullable<DataType['resolveScale']>, resolvePrecision: NonNullable<DataType['resolvePrecision']> } = {
  id: 0x3F,
  type: 'NUMERIC',
  name: 'Numeric',
  hasPrecision: true,
  hasScale: true,

  declaration: function(parameter) {
    return 'numeric(' + (this.resolvePrecision(parameter)) + ', ' + (this.resolveScale(parameter)) + ')';
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
    buffer.writeUInt8(NumericN.id);
    if (parameter.precision! <= 9) {
      buffer.writeUInt8(5);
    } else if (parameter.precision! <= 19) {
      buffer.writeUInt8(9);
    } else if (parameter.precision! <= 28) {
      buffer.writeUInt8(13);
    } else {
      buffer.writeUInt8(17);
    }
    buffer.writeUInt8(parameter.precision);
    buffer.writeUInt8(parameter.scale);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      const sign = parameter.value < 0 ? 0 : 1;
      const value = Math.round(Math.abs(parameter.value * Math.pow(10, parameter.scale!)));
      if (parameter.precision! <= 9) {
        buffer.writeUInt8(5);
        buffer.writeUInt8(sign);
        buffer.writeUInt32LE(value);
      } else if (parameter.precision! <= 19) {
        buffer.writeUInt8(9);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
      } else if (parameter.precision! <= 28) {
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
    cb();
  },

  validate: function(value): null | number | TypeError {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    return value;
  }
};

export default Numeric;
module.exports = Numeric;
