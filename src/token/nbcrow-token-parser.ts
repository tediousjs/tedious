// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser from './stream-parser';
import { NBCRowToken } from './token';
import { NotEnoughDataError } from './helpers';

/**
 * Parses a NBC (null bitmap compressed) row token. Resumable in the same
 * way as the row token parser.
 */
function nbcRowParser(parser: Parser): NBCRowToken {
  const colMetadata = parser.colMetadata;
  const state = parser.rowState();

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
      state.skipColumn(colMetadata[index]);
    } else {
      state.readColumn(parser, colMetadata[index]);
    }
  }

  parser.tokenState = undefined;
  return new NBCRowToken(state.finish(parser.options));
}

export default nbcRowParser;
module.exports = nbcRowParser;
