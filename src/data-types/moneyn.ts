const MoneyN = {
  id: 0x6E,
  type: 'MONEYN',
  name: 'MoneyN',
  dataLengthLength: 1,

  getDataType: function(dataLength) {
    const smallmoney = require('./smallmoney');
    const money = require('./money');

    switch (dataLength) {
      case 4:
        return smallmoney;

      case 8:
        return money;

      default: return this;
    }
  }
};

export default MoneyN;
module.exports = MoneyN;
