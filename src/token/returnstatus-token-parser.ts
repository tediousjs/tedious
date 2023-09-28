// s2.2.7.16
import type { BufferList } from 'bl/BufferList';
import { readInt32LE, type Result } from './helpers';
import { type ParserOptions } from './stream-parser';

import { ReturnStatusToken } from './token';

function returnStatusParser(buf: Buffer | BufferList, offset: number, _options: ParserOptions): Result<ReturnStatusToken> {
  let value;
  ({ value, offset } = readInt32LE(buf, offset));
  return { value: new ReturnStatusToken(value), offset };
}

export default returnStatusParser;
module.exports = returnStatusParser;
