import Parser, { ParserOptions } from './stream-parser';

import { LoginAckToken } from './token';

import { versionsByValue as versions } from '../tds-versions';
import BufferReader from './buffer-reader';

class NotEnoughDataError extends Error { }

const interfaceTypes: { [key: number]: string } = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

function parseToken(parser: Parser): LoginAckToken {
  const br = new BufferReader(parser);
  br.readUInt16LE();
  const interfaceNumber = br.readUInt8();
  const interfaceType = interfaceTypes[interfaceNumber];
  const tdsVersionNumber = br.readUInt32BE();
  const tdsVersion = versions[tdsVersionNumber];
  const progName = br.readBVarChar();
  const major = br.readUInt8();
  const minor = br.readUInt8();
  const buildNumHi = br.readUInt8();
  const buildNumLow = br.readUInt8();

  return new LoginAckToken({
    interface: interfaceType,
    tdsVersion: tdsVersion,
    progName: progName,
    progVersion: {
      major: major,
      minor: minor,
      buildNumHi: buildNumHi,
      buildNumLow: buildNumLow
    }
  });
}

function loginAckParser(parser: Parser, _options: ParserOptions, callback: (token: LoginAckToken) => void) {
  let data!: LoginAckToken;
  try {
    data = parseToken(parser);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        loginAckParser(parser, _options, callback);
      });
    }
  }

  callback(data);
}

export default loginAckParser;
module.exports = loginAckParser;
