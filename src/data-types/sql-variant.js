module.exports = {
  id: 0x62,
  type: 'SSVARIANTTYPE',
  name: 'Variant',
  dataLengthLength: 4,

  declaration: function(parameter) {
    return 'sql_variant';
  }
};
