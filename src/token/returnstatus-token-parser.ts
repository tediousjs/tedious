// s2.2.7.16
import BufferReader from './buffer-reader';
import Parser, { ParserOptions } from './stream-parser';

import { ReturnStatusToken } from './token';

class NotEnoughDataError extends Error { }

function parseToken(parser: Parser): number {
  const br = new BufferReader(parser);
  const value = br.readInt32LE();
  return value;
}

function returnStatusParser(parser: Parser, _options: ParserOptions, callback: (token: ReturnStatusToken) => void) {
  let data!: number;
  try {
    data = parseToken(parser);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        returnStatusParser(parser, _options, callback);
      });
    }
  }
  callback(new ReturnStatusToken(data));
}

export default returnStatusParser;
module.exports = returnStatusParser;
