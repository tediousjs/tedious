// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser from './stream-parser';

import { NBCRowToken } from './token';

import { NotEnoughDataError } from './helpers';
import { rowState, readColumn, columnsToToken } from './row-token-parser';

/**
 * Parses a NBC (null bitmap compressed) row token. Resumable in the same
 * way as the row token parser.
 */
function nbcRowParser(parser: Parser): NBCRowToken {
  const colMetadata = parser.colMetadata;
  const state = rowState(parser);

  let bitmap = state.bitmap;
  if (bitmap === undefined) {
    const bitmapByteLength = Math.ceil(colMetadata.length / 8);

    if (parser.buffer.length - parser.position < bitmapByteLength) {
      throw new NotEnoughDataError(parser.position + bitmapByteLength);
    }

    bitmap = state.bitmap = parser.buffer.slice(parser.position, parser.position + bitmapByteLength);
    parser.position += bitmapByteLength;
    parser.commit();
  }

  while (state.index < colMetadata.length) {
    const index = state.index;

    if (bitmap[index >> 3] & (1 << (index & 7))) {
      state.columns[index] = { value: null, metadata: colMetadata[index] };
      state.index += 1;
      continue;
    }

    readColumn(parser, state, colMetadata[index]);
  }

  parser.tokenState = undefined;
  return columnsToToken(parser, state.columns, (columns) => new NBCRowToken(columns));
}

export default nbcRowParser;
module.exports = nbcRowParser;
