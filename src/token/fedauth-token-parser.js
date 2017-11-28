const async = require('async');

const FedAuthInfoID = {
  STSURL: 0x01,
  SPN: 0x02
};

var fedAuthInfoResponse = {
  ststurl: undefined,
  spn: undefined
};

var readFedAuthInfoOpt = (parser, callback) => {
  parser.readInt8((fedauthInfoID) => {
    parser.readUInt32BE((fedAuthInfoDataLen) => {
      parser.readUInt32BE((fedAuthInfoDataOffset) => {
        const dataBuf = parser.buffer.toString('utf16le', fedAuthInfoDataOffset, fedAuthInfoDataOffset + fedAuthInfoDataLen);
        switch (fedauthInfoID) {
          case FedAuthInfoID.SPN:
            fedAuthInfoResponse.ststurl = dataBuf;
            break;
          case FedAuthInfoID.STSURL:
            fedAuthInfoResponse.spn = dataBuf;
            break;
            // ignoring unknown fedauthinfo options
          default:
            break;
        }
      });
    });
  });
};

module.exports = function(parser, colMetadata, options, callback) {
  parser.readUInt32BE((tokenLength) => {
    parser.readUInt32BE((countOfInfoIDs) => {
      async.times(countOfInfoIDs, readFedAuthInfoOpt(parser, callback));
      callback({
        'name': 'FEDAUTHINFO',
        'event': 'fedAuthInfo',
        'fedAuthInfoData': {
          ststurl: fedAuthInfoResponse.ststurl,
          spn: fedAuthInfoResponse.spn
        }
      });
    });
  });
};
