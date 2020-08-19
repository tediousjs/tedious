import { LoginAckToken } from './token';

import { versionsByValue as versions } from '../tds-versions';
import { IncompleteError, uInt16LE, uInt8, Result, bVarChar, uInt32BE, wrap } from '../parser';

const interfaceTypes: { [key: number]: string } = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

function parseToken(buffer: Buffer, offset: number): Result<LoginAckToken> {
  let interfaceNumber;
  ({ offset, value: interfaceNumber } = uInt8(buffer, offset));
  const interfaceType = interfaceTypes[interfaceNumber];

  let tdsVersionNumber;
  ({ offset, value: tdsVersionNumber } = uInt32BE(buffer, offset));
  const tdsVersion = versions[tdsVersionNumber];

  let progName;
  ({ offset, value: progName } = bVarChar(buffer, offset));

  let major;
  ({ offset, value: major } = uInt8(buffer, offset));

  let minor;
  ({ offset, value: minor } = uInt8(buffer, offset));

  let buildNumHi;
  ({ offset, value: buildNumHi } = uInt8(buffer, offset));

  let buildNumLow;
  ({ offset, value: buildNumLow } = uInt8(buffer, offset));

  return new Result(offset, new LoginAckToken({
    interface: interfaceType,
    tdsVersion: tdsVersion,
    progName: progName,
    progVersion: {
      major: major,
      minor: minor,
      buildNumHi: buildNumHi,
      buildNumLow: buildNumLow
    }
  }));
}

const loginAckParser = wrap(function loginAckParser(buffer: Buffer, offset: number) {
  let tokenLength;
  ({ offset, value: tokenLength } = uInt16LE(buffer, offset));

  // Ensure we can read the full token
  if (buffer.length < offset + tokenLength) {
    throw new IncompleteError();
  }

  try {
    return parseToken(buffer, offset);
  } catch (err) {
    if (err instanceof IncompleteError) {
      throw new Error('Malformed LoginAck token');
    }

    throw err;
  }
});

export default loginAckParser;
module.exports = loginAckParser;
