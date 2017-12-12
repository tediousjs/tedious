const async = require('async');

const FedAuthInfoID = {
  STSURL: 0x01,
  SPN: 0x02
};

const TERMINATOR = 0xFF;

var infoData = {
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

function FeatureAckOpt(parser,featureId ,callback){
  parser.readUInt8((featureId) => {
    parser.readUInt32LE((featureAckDataLen) => {
      parser.readBuffer(featureAckDataLen, (featureData) => {
        callback({
          'name': 'FEATUREEXTACK',
          'event': 'featureExtAck',
          'feature': {
            id: featureId,
            data: featureData
          }
        });
      });
    });
  });
}

module.exports.featureExtAckParser = featureExtAckParser;

function featureExtAckParser(parser, colMetadata, options, callback) {  
  loop(parser, featureId, callback) {
    if(featureId != TERMINATOR){
      loop(parser, featureId, callback);
    }
  }
  /*
  // while featureId != TDS.FEATURE_EXT_TERMINATOR
  // there might be other features
  parser.readUInt8((featureId) => {
    parser.readUInt32LE((featureAckDataLen) => {
      parser.readBuffer(featureAckDataLen, (featureData) => {
        callback({
          'name': 'FEATUREEXTACK',
          'event': 'featureExtAck',
          'feature': {
            id: featureId,
            data: featureData
          }
        });
      });
    });
    // If the FEDAUTH FeatureId is not present, the TDS client MUST close the underlying transport connection,
  });*/
}
