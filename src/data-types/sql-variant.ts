import { ParameterData } from '../data-type';
const Variant = {
  id: 0x62,
  type: 'SSVARIANTTYPE',
  name: 'Variant',
  dataLengthLength: 4,

  declaration: function(parameter: ParameterData<any>) {
    return 'sql_variant';
  }
};

export default Variant;
module.exports = Variant;
