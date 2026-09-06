import { type DataType } from '../data-type';
import { writeDecimal, writeDecimalTypeInfo } from './decimal-common';
import DecimalN from './decimaln';

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

  writeTypeInfo(buffer, parameter) {
    writeDecimalTypeInfo(buffer, DecimalN.id, parameter.precision, parameter.scale);
  },

  writeValue(buffer, parameter) {
    writeDecimal(buffer, parameter.value as number | null, parameter.precision, parameter.scale, 'DECIMAL');
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
