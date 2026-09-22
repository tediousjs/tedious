// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser, { type TokenReader } from './stream-parser';

import { NBCRowToken } from './token';
import { NotEnoughDataError } from './helpers';
import { ColumnValuesReader, toColumnsMap } from './row-token-parser';

/**
 * Reads an `NBCROW` token - a `ROW` token prefixed with a bitmap that flags
 * `null` columns, which then have no data.
 */
export class NBCRowTokenReader extends ColumnValuesReader implements TokenReader {
  declare nullBitmap: Buffer | undefined;

  constructor() {
    super();
    this.nullBitmap = undefined;
  }

  read(parser: Parser): NBCRowToken {
    if (this.nullBitmap === undefined) {
      const start = parser.position;
      const end = start + Math.ceil(parser.colMetadata.length / 8);
      if (parser.buffer.length < end) {
        throw new NotEnoughDataError(end);
      }

      this.nullBitmap = parser.buffer.subarray(start, end);
      parser.position = end;
    }

    this.readColumns(parser, this.nullBitmap);
    return new NBCRowToken(parser.options.useColumnNames ? toColumnsMap(this.columns) : this.columns);
  }
}
