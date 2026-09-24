// s2.2.7.17

import Parser from './stream-parser';
import { RowToken } from './token';

/**
 * Parses a row token. Resumable: if the buffered data runs out, the
 * columns parsed so far are kept on the parser and parsing continues with
 * the next column once more data is available.
 */
function rowParser(parser: Parser): RowToken {
  const colMetadata = parser.colMetadata;
  const state = parser.rowState();

  while (state.index < colMetadata.length) {
    state.readColumn(parser, colMetadata[state.index]);
  }

  parser.tokenState = undefined;
  return new RowToken(state.finish(parser.options));
}

export default rowParser;
module.exports = rowParser;
