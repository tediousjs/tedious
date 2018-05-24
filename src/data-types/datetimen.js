module.exports = {
  id: 0x6F,
  type: 'DATETIMN',
  name: 'DateTimeN',
  dataLengthLength: 1,
  EPOCH_DATE: new Date(1900, 0, 1),
  UTC_EPOCH_DATE: new Date(Date.UTC(1900, 0, 1)),
  YEAR_ONE: new Date(2000, 0, -730118),
  UTC_YEAR_ONE: Date.UTC(2000, 0, -730118),
  // TODO null is not a Date instance: why does it return null (with type coercion in comparison)?
  validate: function(value) {
    if (value == null) {
      return null;
    }
    // do Date.parse internally and duplicate existing date instances
    const _date = new Date(value);
    if (isNaN(_date)) {
      return new TypeError('Invalid date.');
    }

    return _date;
  }
};
