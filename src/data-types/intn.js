module.exports = {
  id: 0x26,
  type: 'INTN',
  name: 'IntN',
  dataLengthLength: 1,

  getDataType: function (dataLength) {
    const tinyInt = require('./tinyint');
    const smallInt = require('./smallint');
    const int = require('./int');
    const bigInt = require('./bigint');

    switch (dataLength) {
      case 1:
        return tinyInt;

      case 2:
        return smallInt;

      case 4:
        return int;

      case 8:
        return bigInt;

      default: return this;
    }
  }
};
