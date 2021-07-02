import { DataType } from '../data-type';
import DecimalN from './decimaln';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const NULL_LENGTH = Buffer.from([0x00]);

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

  generateTypeInfo(parameter, _options) {
    let precision;
    if (parameter.precision! <= 9) {
      precision = 0x05;
    } else if (parameter.precision! <= 19) {
      precision = 0x09;
    } else if (parameter.precision! <= 28) {
      precision = 0x0D;
    } else {
      precision = 0x11;
    }

    return Buffer.from([DecimalN.id, precision, parameter.precision!, parameter.scale!]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    const precision = parameter.precision!;
    if (precision <= 9) {
      return Buffer.from([0x05]);
    } else if (precision <= 19) {
      return Buffer.from([0x09]);
    } else if (precision <= 28) {
      return Buffer.from([0x0D]);
    } else {
      return Buffer.from([0x11]);
    }
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const sign = parameter.value < 0 ? 0 : 1;
    const value = Math.round(Math.abs(parameter.value * Math.pow(10, parameter.scale!)));
    const precision = parameter.precision!;
    if (precision <= 9) {
      const buffer = Buffer.alloc(5);
      buffer.writeUInt8(sign, 0);
      buffer.writeUInt32LE(value, 1);
      yield buffer;
    } else if (precision <= 19) {
      const buffer = new WritableTrackingBuffer(9);
      buffer.writeUInt8(sign);
      buffer.writeUInt64LE(value);
      yield buffer.data;
    } else if (precision <= 28) {
      const buffer = new WritableTrackingBuffer(13);
      buffer.writeUInt8(sign);
      buffer.writeUInt64LE(value);
      buffer.writeUInt32LE(0x00000000);
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(17);
      buffer.writeUInt8(sign);
      buffer.writeUInt64LE(value);
      buffer.writeUInt32LE(0x00000000);
      buffer.writeUInt32LE(0x00000000);
      yield buffer.data;
    }
  },

  validate: function(value): number | null {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      throw new TypeError('Invalid number.');
    }
    return value;
  }
};

export default Decimal;
module.exports = Decimal;
