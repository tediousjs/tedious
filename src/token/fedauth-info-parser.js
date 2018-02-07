const async = require('async');

function readFedAuthInfoOpt(data, infoData, FEDAUTHINFOID, callback) {
  const fedauthInfoID = data.readUInt8(infoData.offset);
  infoData.offset += 1;
  const fedAuthInfoDataLen = data.readUInt32LE(infoData.offset);
  infoData.offset += 4;
  const fedAuthInfoDataOffset = data.readUInt32LE(infoData.offset);
  infoData.offset += 4;
  switch (fedauthInfoID) {
    case FEDAUTHINFOID.SPN:
      infoData.spnLen = fedAuthInfoDataLen;
      infoData.spnOffset = fedAuthInfoDataOffset;
      break;
    case FEDAUTHINFOID.STSURL:
      infoData.stsurlLen = fedAuthInfoDataLen;
      infoData.stsurlOffset = fedAuthInfoDataOffset;
      break;
    // ignoring unknown fedauthinfo options
    default:
      break;
  }

  if (infoData.spnLen && infoData.stsurlLen) {
    callback({
      'name': 'FEDAUTHINFO',
      'event': 'fedAuthInfo',
      'fedAuthInfoData': {
        stsurl: data.slice(infoData.stsurlOffset, infoData.stsurlOffset + infoData.stsurlLen).toString('ucs2'),
        spn: data.slice(infoData.spnOffset, infoData.spnOffset + infoData.spnLen).toString('ucs2')
      }
    });
  }
}

module.exports = function fedAuthInfoParser(parser, colMetadata, options, callback) {
  parser.readUInt32LE((tokenLength) => {
    parser.readBuffer(tokenLength, (data) => {

      const infoData = {
        offset: 0,
        spnLen: undefined,
        spnOffset: undefined,
        stsurlLen: undefined,
        stsurloffset: undefined
      };

      const FEDAUTHINFOID = {
        STSURL: 0x01,
        SPN: 0x02
      };

      const countOfInfoIDs = data.readUInt32LE(infoData.offset);
      infoData.offset += 4;
      async.times(countOfInfoIDs, () => {
        readFedAuthInfoOpt(data, infoData, FEDAUTHINFOID, callback);
      });
    });
  });
};

