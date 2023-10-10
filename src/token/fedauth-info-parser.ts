import type { BufferList } from 'bl/BufferList';
import { NotEnoughDataError, readUInt32LE, type Result } from './helpers';
import { type ParserOptions } from './stream-parser';
import { FedAuthInfoToken } from './token';

const FEDAUTHINFOID = {
  STSURL: 0x01,
  SPN: 0x02
};

function readFedAuthInfo(data: Buffer): { spn: string | undefined, stsurl: string | undefined } {
  let offset = 0;
  let spn, stsurl;

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

  return { spn, stsurl };
}

function fedAuthInfoParser(buf: Buffer | BufferList, offset: number, _options: ParserOptions): Result<FedAuthInfoToken> {
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt32LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  const data = buf.slice(offset, offset + tokenLength);
  offset += tokenLength;

  const { spn, stsurl } = readFedAuthInfo(data);
  return { value: new FedAuthInfoToken(spn, stsurl), offset };
}

export default fedAuthInfoParser;
module.exports = fedAuthInfoParser;
