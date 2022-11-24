// s2.2.7.16
import LegacyParser, { ParserOptions } from './stream-parser';
import { ReturnStatusToken } from './token';

import { Int32LE, Map } from '../parser';

export class ReturnStatusTokenParser extends Map<number, ReturnStatusToken> {
  constructor() {
    super(new Int32LE(), (value) => {
      return new ReturnStatusToken(value);
    });
  }
}

export function returnStatusParser(parser: LegacyParser, _options: ParserOptions, callback: (token: ReturnStatusToken) => void) {
  parser.execParser(ReturnStatusTokenParser, callback);
}

export default returnStatusParser;
module.exports = returnStatusParser;
