import { type DataType } from '../data-type';
import NumericN from './numericn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const NULL_LENGTH = Buffer.from([0x00]);

const Numeric: DataType & { resolveScale: NonNullable<DataType['resolveScale']>, resolvePrecision: NonNullable<DataType['resolvePrecision']> } = {
  id: 0x3F,
  type: 'NUMERIC',
  name: 'Numeric',

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

  generateTypeInfo(parameter) {
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

    return Buffer.from([NumericN.id, precision, parameter.precision!, parameter.scale!]);
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
    if (parameter.precision! <= 9) {
      const buffer = Buffer.alloc(5);
      buffer.writeUInt8(sign, 0);
      buffer.writeUInt32LE(value, 1);
      yield buffer;
    } else if (parameter.precision! <= 19) {
      const buffer = new WritableTrackingBuffer(10);
      buffer.writeUInt8(sign);
      buffer.writeUInt64LE(value);
      yield buffer.data;
    } else if (parameter.precision! <= 28) {
      const buffer = new WritableTrackingBuffer(14);
      buffer.writeUInt8(sign);
      buffer.writeUInt64LE(value);
      buffer.writeUInt32LE(0x00000000);
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(18);
      buffer.writeUInt8(sign);
      buffer.writeUInt64LE(value);
      buffer.writeUInt32LE(0x00000000);
      buffer.writeUInt32LE(0x00000000);
      yield buffer.data;
    }
  },

  validate: function(value): null | number {
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

export default Numeric;
module.exports = Numeric;
