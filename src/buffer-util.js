exports.toArray = function(buffer) {
  var array = [],
      a = 0;
  
  while (a < buffer.length) {
    array.push(buffer[a]);
    a++;
  }
  
  return array;
};
