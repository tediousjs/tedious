const FEDAUTHINFOID = {
  STSURL: 0x01,
  SPN: 0x02
};

function readFedAuthInfoOpt(data, infoData, callback) {
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
    const stsurl = data.toString('ucs2', infoData.stsurlOffset, infoData.stsurlOffset + infoData.stsurlLen);
    const spn = data.toString('ucs2', infoData.spnOffset, infoData.spnOffset + infoData.spnLen);
    callback({
      'name': 'FEDAUTHINFO',
      'event': 'fedAuthInfo',
      'fedAuthInfoData': {
        stsurl: stsurl,
        spn: spn
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

      const countOfInfoIDs = data.readUInt32LE(infoData.offset);
      infoData.offset += 4;
      for (let i = 0; i <= countOfInfoIDs; ++i) {
        readFedAuthInfoOpt(data, infoData, callback);
      }
    });
  });
};

