const FEATURE_ID = {
  SESSIONRECOVERY: 0x01,
  FEDAUTH: 0x02,
  COLUMNENCRYPTION: 0x04,
  GLOBALTRANSACTIONS: 0x05,
  AZURESQLSUPPORT: 0x08,
  TERMINATOR: 0xFF
};

module.exports = function featureExtAckParser(parser, colMetadata, options, callback) {
  const token = {
    'name': 'FEATUREEXTACK',
    'event': 'featureExtAck',
    'fedAuth': undefined
  };

  function next(done) {
    parser.readUInt8((featureId) => {
      if (featureId === FEATURE_ID.TERMINATOR) {
        return done();
      }

      parser.readUInt32LE((featureAckDataLen) => {
        parser.readBuffer(featureAckDataLen, (featureData) => {
          if (featureId === FEATURE_ID.FEDAUTH) {
            token.fedAuth = featureData;
          }

          next(done);
        });
      });
    });
  }

  next(() => { callback(token); });
};
