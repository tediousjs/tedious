import Parser, { ParserOptions } from './stream-parser';
import { FedAuthInfoToken } from './token';

import { LVarbyte, Map, Record, UInt8, UInt32LE } from '../parser';

const FEDAUTHINFOID = {
  STSURL: 0x01,
  SPN: 0x02
};

interface FedAuthInfoOpt {
  fedAuthInfoID: number;
  fedAuthInfoDataLen: number;
  fedAuthInfoDataOffset: number;
}

class FedAuthInfoOptParser extends Record<FedAuthInfoOpt> {
  constructor() {
    super({
      fedAuthInfoID: new UInt8(),
      fedAuthInfoDataLen: new UInt32LE(),
      fedAuthInfoDataOffset: new UInt32LE()
    });
  }
}

function parseTokenData(buffer: Buffer) {
  let offset = 0;
  let spn: string | undefined, stsurl: string | undefined;
  const result = new UInt32LE().parse(buffer, offset);

  if (!result.done) {
    throw new Error('Parsing error');
  }

  const countOfInfoIDs = result.value;
  offset = result.offset;
  for (let i = 0; i < countOfInfoIDs!; i++) {
    const parser = new FedAuthInfoOptParser();
    const result = parser.parse(buffer, offset);

    if (!result.done) {
      throw new Error('Parsing error');
    }

    const info = result.value;

    switch (info.fedAuthInfoID) {
      case FEDAUTHINFOID.SPN:
        spn = buffer.toString('ucs2', info.fedAuthInfoDataOffset, info.fedAuthInfoDataOffset + info.fedAuthInfoDataLen);
        break;

      case FEDAUTHINFOID.STSURL:
        stsurl = buffer.toString('ucs2', info.fedAuthInfoDataOffset, info.fedAuthInfoDataOffset + info.fedAuthInfoDataLen);
        break;

      // ignoring unknown fedauthinfo options
      default:
        break;
    }
    offset = result.offset;
  }

  return new FedAuthInfoToken(spn, stsurl);
}

export class FedAuthInfoTokenParser extends Map<Buffer, FedAuthInfoToken> {
  constructor() {
    super(new LVarbyte(), (buffer) => {
      return parseTokenData(buffer);
    });
  }
}

function fedAuthInfoParser(parser: Parser, options: ParserOptions, callback: (token: FedAuthInfoToken) => void) {
  parser.execParser(FedAuthInfoTokenParser, callback);
}

export default fedAuthInfoParser;
module.exports = fedAuthInfoParser;
