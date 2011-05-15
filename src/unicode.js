var bufferToArray = require('./buffer-util').toArray;

exports.textToUnicode = function(text) {
  var buffer = new Buffer(text, 'ucs2');

  return bufferToArray(buffer);
};

exports.unicodeToText = function(array, length, offset) {
  offset = offset || 0;
  
  var buffer = new Buffer(array.slice(offset, offset + length));

  return buffer.toString('ucs2');
};
