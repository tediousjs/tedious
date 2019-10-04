const DateTimeN = {
  id: 0x6F,
  type: 'DATETIMN',
  name: 'DateTimeN',
  dataLengthLength: 1,

  getDataType: function(dataLength: number) {
    const smalldatetime = require('./smalldatetime');
    const datetime = require('./datetime');

    switch (dataLength) {
      case 4:
        return smalldatetime;

      case 8:
        return datetime;

      default: return this;
    }
  }
};

export default DateTimeN;
module.exports = DateTimeN;
