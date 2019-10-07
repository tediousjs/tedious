module.exports = {
  id: 0x6C,
  type: 'NUMERICN',
  name: 'NumericN',
  dataLengthLength: 1,
  hasPrecision: true,
  hasScale: true,

  getDataType: function(dataLength) {
    const numeric = require('./numeric');

    return (dataLength === 17) ? numeric : this;
  }
};
