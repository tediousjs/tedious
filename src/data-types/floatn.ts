const FloatN = {
  id: 0x6D,
  type: 'FLTN',
  name: 'FloatN',
  dataLengthLength: 1,

  getDataType: function(dataLength) {
    const float = require('./float');

    return (dataLength === 4 || dataLength === 8) ? float : this;
  }
};

export default FloatN;
module.exports = FloatN;
