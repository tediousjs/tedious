// s2.2.7.16
import Parser, { ParserOptions } from './stream-parser';

import { ReturnStatusToken } from './token';

class NotEnoughDataError extends Error { }

function parseToken(parser: Parser): number {
  const buffer = parser.buffer;
  if (buffer.length < parser.position + 4) {
    throw new NotEnoughDataError();
  }
  const data = parser.buffer.readInt32LE(parser.position);
  parser.position += 4;
  return data;
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
