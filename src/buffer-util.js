exports.toArray = function(buffer) {
  return Array.prototype.slice.call(buffer, 0);
};
