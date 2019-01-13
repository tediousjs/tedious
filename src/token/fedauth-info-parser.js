const FEDAUTHINFOID = {
  STSURL: 0x01,
  SPN: 0x02
};

module.exports = function fedAuthInfoParser(parser, colMetadata, options, callback) {
  parser.readUInt32LE((tokenLength) => {
    parser.readBuffer(tokenLength, (data) => {
      const token = {
        'name': 'FEDAUTHINFO',
        'event': 'fedAuthInfo',
        'spn': undefined,
        'stsurl': undefined
      };

      let offset = 0;

      const countOfInfoIDs = data.readUInt32LE(offset);
      offset += 4;

      for (let i = 0; i < countOfInfoIDs; i++) {
        const fedauthInfoID = data.readUInt8(offset);
        offset += 1;

        const fedAuthInfoDataLen = data.readUInt32LE(offset);
        offset += 4;

        const fedAuthInfoDataOffset = data.readUInt32LE(offset);
        offset += 4;

        switch (fedauthInfoID) {
          case FEDAUTHINFOID.SPN:
            token.spn = data.toString('ucs2', fedAuthInfoDataOffset, fedAuthInfoDataOffset + fedAuthInfoDataLen);
            break;

          case FEDAUTHINFOID.STSURL:
            token.stsurl = data.toString('ucs2', fedAuthInfoDataOffset, fedAuthInfoDataOffset + fedAuthInfoDataLen);
            break;

          // ignoring unknown fedauthinfo options
          default:
            break;
        }
      }

      callback(token);
    });
  });
};
