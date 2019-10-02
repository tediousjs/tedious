import { DataTypeN } from "../data-type";

const DecimalN: DataTypeN = {
  id: 0x6A,
  type: 'DECIMALN',
  name: 'DecimalN',
  dataLengthLength: 1,
  hasPrecision: true,
  hasScale: true
};

export default DecimalN;
module.exports = DecimalN;
