import { DataType } from '../data-type';
import DecimalN from './decimaln';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const Decimal: DataType & { resolvePrecision: NonNullable<DataType['resolvePrecision']>, resolveScale: NonNullable<DataType['resolveScale']> } = {
  id: 0x37,
  type: 'DECIMAL',
  name: 'Decimal',

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

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function*(parameter, options) {
    if (parameter.value != null) {
      const sign = parameter.value < 0 ? 0 : 1;
      const value = Math.round(Math.abs(parameter.value * Math.pow(10, parameter.scale!)));
      if (parameter.precision! <= 9) {
        const buffer = new WritableTrackingBuffer(6);
        buffer.writeUInt8(5);
        buffer.writeUInt8(sign);
        buffer.writeUInt32LE(value);
        yield buffer.data;
      } else if (parameter.precision! <= 19) {
        const buffer = new WritableTrackingBuffer(10);
        buffer.writeUInt8(9);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
        yield buffer.data;
      } else if (parameter.precision! <= 28) {
        const buffer = new WritableTrackingBuffer(14);
        buffer.writeUInt8(13);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
        buffer.writeUInt32LE(0x00000000);
        yield buffer.data;
      } else {
        const buffer = new WritableTrackingBuffer(18);
        buffer.writeUInt8(17);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
        buffer.writeUInt32LE(0x00000000);
        buffer.writeUInt32LE(0x00000000);
        yield buffer.data;
      }
    } else {
      const buffer = new WritableTrackingBuffer(1);
      buffer.writeUInt8(0);
      yield buffer.data;
    }
  },

  validate: function(value): number | null | TypeError {
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

export default Decimal;
module.exports = Decimal;
