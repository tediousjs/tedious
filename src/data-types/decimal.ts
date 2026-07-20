import { type DataType } from '../data-type';
import DecimalN from './decimaln';

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
    const precision = parameter.precision!;

    // Number of bytes used to encode the unsigned magnitude for the resolved precision.
    let dataLength;
    if (precision <= 9) {
      dataLength = 4;
    } else if (precision <= 19) {
      dataLength = 8;
    } else if (precision <= 28) {
      dataLength = 12;
    } else {
      dataLength = 16;
    }

    // Encode the scaled magnitude as a little-endian unsigned integer spanning the
    // full width. Using a BigInt avoids the `RangeError` that was thrown when the
    // scaled value exceeded 2^64 for high-precision columns, and correctly fills the
    // high-order words instead of hardcoding them to zero.
    // See https://github.com/tediousjs/tedious/issues/1733
    let magnitude = BigInt(Math.round(Math.abs(parameter.value * Math.pow(10, parameter.scale!))));

    // Guard against values that overflow the field: throwing here surfaces a
    // catchable error to the caller instead of silently truncating the magnitude.
    if (magnitude >= (1n << BigInt(8 * dataLength))) {
      throw new RangeError(`Value ${parameter.value} is out of range for DECIMAL(${precision}, ${parameter.scale}).`);
    }

    const buffer = Buffer.alloc(1 + dataLength);
    buffer.writeUInt8(sign, 0);
    for (let i = 1; i <= dataLength; i++) {
      buffer[i] = Number(magnitude & 0xffn);
      magnitude >>= 8n;
    }
    yield buffer;
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
