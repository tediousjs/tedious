import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';
import { FedAuthInfoToken } from './token';

const FEDAUTHINFOID = {
  STSURL: 0x01,
  SPN: 0x02
};

function parseToken(data: Buffer): FedAuthInfoToken {
  let spn, stsurl;
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
        spn = data.toString('ucs2', fedAuthInfoDataOffset, fedAuthInfoDataOffset + fedAuthInfoDataLen);
        break;

      case FEDAUTHINFOID.STSURL:
        stsurl = data.toString('ucs2', fedAuthInfoDataOffset, fedAuthInfoDataOffset + fedAuthInfoDataLen);
        break;

      // ignoring unknown fedauthinfo options
      default:
        break;
    }
  }

  return new FedAuthInfoToken(spn, stsurl);
}

function fedAuthInfoParser(parser: Parser, options: InternalConnectionOptions, callback: (token: FedAuthInfoToken) => void) {
  const { buffer, position } = parser;

  if (buffer.length < position + 4) {
    return parser.suspend(() => {
      fedAuthInfoParser(parser, options, callback);
    });
  }

  const tokenLength = buffer.readUInt32LE(position);
  const data = buffer.slice(position, position + tokenLength);

  callback(parseToken(data));
}

export default fedAuthInfoParser;
module.exports = fedAuthInfoParser;
