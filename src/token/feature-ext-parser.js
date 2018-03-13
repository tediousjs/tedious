
module.exports = function featureExtAckParser(parser, colMetadata, options, callback) {
  var id = undefined;
  var len = undefined;
  function next(done) {
    parser.readUInt8((featureId) => {
      if (featureId === 0xFF) {
        return done();
      }
      id = featureId;
      parser.readUInt32LE((featureAckDataLen) => {
        len = featureAckDataLen;
        parser.readBuffer(featureAckDataLen, (featureData) => {
          next(done);
        });
      });
    });
  }
  next(() => {
    callback({
      'name': 'FEATUREEXTACK',
      'event': 'featureExtAck',
      featureId: id,
      featureAckDataLen: len
    });
  });
};
