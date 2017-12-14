const async = require('async');

const FedAuthInfoID = {
  STSURL: 0x01,
  SPN: 0x02
};

const TERMINATOR = 0xFF;

const infoData = {
  spnLen: undefined,
  stsurlLen: undefined
};

var readFedAuthInfoOpt = (parser, callback) => {
  parser.readUInt8((fedauthInfoID) => {
    parser.readUInt32LE((fedAuthInfoDataLen) => {
      parser.readUInt32LE((fedAuthInfoDataOffset) => {

        switch (fedauthInfoID) {
          case FedAuthInfoID.SPN:
            infoData.spnLen = fedAuthInfoDataLen ;
            break;
          case FedAuthInfoID.STSURL:
            infoData.stsurlLen = fedAuthInfoDataLen ;
            break;
            // ignoring unknown fedauthinfo options
          default:
            break;
        }
        if (infoData.spnLen && infoData.stsurlLen) {
          parser.readBuffer(infoData.spnLen, (spn) => {
            parser.readBuffer(infoData.stsurlLen, (stsurl) => {
              callback({
                'name': 'FEDAUTHINFO',
                'event': 'fedAuthInfo',
                'fedAuthInfoData': {
                  stsurl: stsurl.toString().replace(/\0/g, ''),
                  spn: spn.toString().replace(/\0/g, '')
                }
              });
            });
          });
        }
      });
    });
  });
};

module.exports.fedAuthInfoParser = fedAuthInfoParser;
function fedAuthInfoParser(parser, colMetadata, options, callback) {
  parser.readUInt32LE((tokenLength) => {
    parser.readUInt32LE((countOfInfoIDs) => {
      async.times(countOfInfoIDs, () => {
        readFedAuthInfoOpt(parser, callback);
      });
    });
  });
}

module.exports.featureExtAckParser = featureExtAckParser;
function featureExtAckParser(parser, colMetadata, options, callback) {
  // there might be other features

    // TODO: If the FEDAUTH FeatureId is not present, the TDS client MUST close the underlying transport connection
    // switch case on featureIds and fedauth types
  function next(done) {
    parser.readUInt8((featureId) => {
      if (featureId === TERMINATOR) {
        return done();
      }
      parser.readUInt32LE((featureAckDataLen) => {
        parser.readBuffer(featureAckDataLen, (fd) => {
          //len must be zero
          next(done);
        });
      });
    });
  }
  next(() => {
    callback(undefined);
  });
}
