const DecimalN = {
  id: 0x6A,
  type: 'DECIMALN',
  name: 'DecimalN',
  dataLengthLength: 1,
  hasPrecision: true,
  hasScale: true,

  getDataType: function(dataLength) {
    const decimal = require('./decimal');

    return (dataLength === 17) ? decimal : this;
  }
};

export default DecimalN;
module.exports = DecimalN;
