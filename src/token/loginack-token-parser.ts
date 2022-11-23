import LegacyParser, { ParserOptions } from './stream-parser';
import { LoginAckToken } from './token';

import { UInt8, UInt32BE, UsVarbyte, BVarchar, Map, Record } from '../parser';

import { versionsByValue as versions } from '../tds-versions';

const interfaceTypes: { [key: number]: string } = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

interface TokenData {
  interface: string;
  tdsVersion: string;
  progName: string;
  progVersion: {
    major: number;
    minor: number;
    buildNumHi: number;
    buildNumLow: number;
  };
}

class TokenDataParser extends Record<TokenData> {
  constructor() {
    super({
      interface: new Map(new UInt8(), (interfaceNumber) => {
        return interfaceTypes[interfaceNumber];
      }),
      tdsVersion: new Map(new UInt32BE(), (tdsVersionNumber) => {
        return versions[tdsVersionNumber];
      }),
      progName: new BVarchar(),
      progVersion: new Record({
        major: new UInt8(),
        minor: new UInt8(),
        buildNumHi: new UInt8(),
        buildNumLow: new UInt8(),
      }),
    });
  }
}

function parseTokenData(buffer: Buffer) {
  const parser = new TokenDataParser();
  const result = parser.parse(buffer, 0);

  if (!result.done || result.offset !== buffer.length) {
    throw new Error('Parsing error');
  }

  return new LoginAckToken(result.value);
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
