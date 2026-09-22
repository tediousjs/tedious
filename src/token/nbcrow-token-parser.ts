// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser, { type TokenReader } from './stream-parser';

import { NBCRowToken } from './token';
import { ColumnValuesReader, readNullBitmap, toColumnsMap } from './row-token-parser';

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
    this.nullBitmap ??= readNullBitmap(parser);

    this.readColumns(parser, this.nullBitmap);
    return new NBCRowToken(parser.options.useColumnNames ? toColumnsMap(this.columns) : this.columns);
  }
}
