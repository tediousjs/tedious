import { type DataType } from '../data-type';
import { writeDecimal, writeDecimalTypeInfo } from './decimal-common';
import NumericN from './numericn';

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

  writeTypeInfo(buffer, parameter) {
    writeDecimalTypeInfo(buffer, NumericN.id, parameter.precision, parameter.scale);
  },

  compileWriter(column) {
    const precision = column.precision;
    const scale = column.scale;
    return (buffer, raw) => {
      const value = Numeric.validate(raw, undefined) as number | null;
      writeDecimal(buffer, value, precision, scale, 'NUMERIC');
    };
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
