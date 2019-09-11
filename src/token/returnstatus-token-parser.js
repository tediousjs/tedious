// s2.2.7.16

const { ReturnStatusToken } = require('./token');

module.exports = function(parser, colMetadata, options, callback) {
  parser.readInt32LE((value) => {
    callback(new ReturnStatusToken(value));
  });
};
