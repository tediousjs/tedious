
module.exports = function featureExtAckParser(parser, colMetadata, options, callback) {

  const featureAckOpts = [];
  function next(done) {
    parser.readUInt8((featureId) => {
      if (featureId === 0xFF) {
        return done();
      }
      parser.readUInt32LE((featureAckDataLen) => {
        parser.readBuffer(featureAckDataLen, (featureData) => {
          featureAckOpts[featureId] = featureData;
          next(done);
        });
      });
    });
  }
  next(() => {
    callback({
      'name': 'FEATUREEXTACK',
      'event': 'featureExtAck',
      featureAckOpts: featureAckOpts
    });
  });
};
