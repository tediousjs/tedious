module.exports = function(parser, colMetadata, options, callback) {
  parser.readUsVarByte((buffer) => {
    callback({
      name: 'SSPICHALLENGE',
      event: 'sspichallenge',
      buffer: buffer
    });
  });
};
