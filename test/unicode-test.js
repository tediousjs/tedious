var unicode = require('../src/unicode');

exports.textToUnicode = function(test) {
  test.deepEqual(unicode.textToUnicode('abc'), [0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  
  test.done();
};

exports.unicodeToText = function(test) {
  test.deepEqual(unicode.unicodeToText([0x61, 0x00, 0x62, 0x00, 0x63, 0x00], 6, 0), 'abc');
  
  test.done();
};
