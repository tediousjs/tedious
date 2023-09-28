import { type ParserOptions } from './stream-parser';

import { LoginAckToken } from './token';

import { versionsByValue as versions } from '../tds-versions';
import type { BufferList } from 'bl/BufferList';
import { NotEnoughDataError, readBVarChar, readUInt16LE, readUInt32BE, readUInt8, type Result } from './helpers';

const interfaceTypes: { [key: number]: string } = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

function loginAckParser(buf: Buffer | BufferList, offset: number, _options: ParserOptions): Result<LoginAckToken> {
  // length
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  let interfaceNumber;
  ({ offset, value: interfaceNumber } = readUInt8(buf, offset));

  const interfaceType = interfaceTypes[interfaceNumber];

  let tdsVersionNumber;
  ({ offset, value: tdsVersionNumber } = readUInt32BE(buf, offset));

  const tdsVersion = versions[tdsVersionNumber];

  let progName;
  ({ offset, value: progName } = readBVarChar(buf, offset));

  let major;
  ({ offset, value: major } = readUInt8(buf, offset));

  let minor;
  ({ offset, value: minor } = readUInt8(buf, offset));

  let buildNumHi;
  ({ offset, value: buildNumHi } = readUInt8(buf, offset));

  let buildNumLow;
  ({ offset, value: buildNumLow } = readUInt8(buf, offset));

  return {
    value: new LoginAckToken({
      interface: interfaceType,
      tdsVersion: tdsVersion,
      progName: progName,
      progVersion: {
        major: major,
        minor: minor,
        buildNumHi: buildNumHi,
        buildNumLow: buildNumLow
      }
    }),
    offset
  };
}

export default loginAckParser;
module.exports = loginAckParser;
