
exports.versions =
  '7_1': 0x71000001
  '7_2': 0x72090002
  '7_3_A': 0x730A0003
  '7_3_B': 0x730B0003

exports.versionsByValue = {}
for name, value of exports.versions
  exports.versionsByValue[value] = name
