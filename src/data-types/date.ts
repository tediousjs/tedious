import { DataType } from '../data-type';

// globalDate is to be used for JavaScript's global 'Date' object to avoid name clashing with the 'Date' constant below
const globalDate = global.Date;
const YEAR_ONE = new globalDate(2000, 0, -730118);
const UTC_YEAR_ONE = globalDate.UTC(2000, 0, -730118);

const Date : DataType = {
  id: 0x28,
  type: 'DATEN',
  name: 'Date',

  declaration: function() {
    return 'date';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(this.id);
  },

  // ParameterData<any> is temporary solution. TODO: need to understand what type ParameterData<...> can be.
  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(3);
      if (options.useUTC) {
        buffer.writeUInt24LE(Math.floor((+parameter.value - UTC_YEAR_ONE) / 86400000));
      } else {
        const dstDiff = -(parameter.value.getTimezoneOffset() - YEAR_ONE.getTimezoneOffset()) * 60 * 1000;
        buffer.writeUInt24LE(Math.floor((+parameter.value - +YEAR_ONE + dstDiff) / 86400000));
      }
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  // TODO: value is techincally of type 'unknown'.
  validate: function(value): null | Date | TypeError {
    if (value == null) {
      return null;
    }
    if (!(value instanceof globalDate)) {
      value = globalDate.parse(value);
    }
    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }
    return value;
  }
};

export default Date;
module.exports = Date;
