import { NotEnoughDataError, readUInt16LE, Result } from './helpers';
import { type ParserOptions } from './stream-parser';

import { SSPIToken } from './token';

function sspiParser(buf: Buffer, offset: number, _options: ParserOptions): Result<SSPIToken> {
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  const data = buf.slice(offset, offset + tokenLength);
  offset += tokenLength;

  return new Result(new SSPIToken(data), offset);
}

export default sspiParser;
module.exports = sspiParser;
