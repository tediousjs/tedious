const BitN = {
  id: 0x68,
  type: 'BITN',
  name: 'BitN',
  dataLengthLength: 1,

  getDataType: function(dataLength: number) {
    const bit = require('./bit');

    return (dataLength === 1) ? bit : this;
  }
};

export default BitN;
module.exports = BitN;
