// s2.2.7.16
import Parser, { ParserOptions } from './stream-parser';

import { ReturnStatusToken } from './token';

function returnStatusParser(parser: Parser, _options: ParserOptions, callback: (token: ReturnStatusToken) => void) {
  parser.readInt32LE((value) => {
    callback(new ReturnStatusToken(value));
  });
}

export default returnStatusParser;
module.exports = returnStatusParser;
