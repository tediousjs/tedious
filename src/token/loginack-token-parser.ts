import LegacyParser, { ParserOptions } from './stream-parser';
import { LoginAckToken } from './token';

import { UInt8, UInt32BE, UsVarbyte, BVarchar, Map, Record } from '../parser';

import { versionsByValue as versions } from '../tds-versions';

const interfaceTypes: { [key: number]: string } = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

interface TokenData {
  interfaceNumber: number;
  tdsVersionNumber: number;
  progName: string;
  major: number;
  minor: number;
  buildNumHi: number;
  buildNumLow: number;
}

class TokenDataParser extends Record<TokenData> {
  constructor() {
    super({
      interfaceNumber: new UInt8(),
      tdsVersionNumber: new UInt32BE(),
      progName: new BVarchar(),
      major: new UInt8(),
      minor: new UInt8(),
      buildNumHi: new UInt8(),
      buildNumLow: new UInt8(),
    });
  }
}

function parseTokenData(buffer: Buffer) {
  const parser = new TokenDataParser();
  const result = parser.parse(buffer, 0);

  if (!result.done || result.offset !== buffer.length) {
    throw new Error('Parsing error');
  }

  const data = result.value;

  return new LoginAckToken({
    interface: interfaceTypes[data.interfaceNumber],
    tdsVersion: versions[data.tdsVersionNumber],
    progName: data.progName,
    progVersion: {
      major: data.major,
      minor: data.minor,
      buildNumHi: data.buildNumHi,
      buildNumLow: data.buildNumLow,
    }
  });
}

export class LoginAckTokenParser extends Map<Buffer, LoginAckToken> {
  constructor() {
    super(new UsVarbyte(), (buffer) => {
      return parseTokenData(buffer);
    });
  }
}

function loginAckParser(parser: LegacyParser, _options: ParserOptions, callback: (token: LoginAckToken) => void) {
  parser.execParser(LoginAckTokenParser, callback);
}

export default loginAckParser;
module.exports = loginAckParser;
