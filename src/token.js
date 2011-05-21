exports.DONE_STATUSES = {
  0x00 : 'FINAL',
  0x01 : 'MORE',
  0x02 : 'ERROR',
  0x04 : 'INXACT',
  0x10 : 'COUNT',
  0x20 : 'ATTN',
  0x100 : 'SRVERROR',
};

exports.DONE_STATUS = (function() {
  var statuses = {};
  
  Object.keys(exports.DONE_STATUSES).forEach(function(key) {
    statuses[exports.DONE_STATUSES[key]] = parseInt(key, 16);
  });
  
  return statuses;
})();
