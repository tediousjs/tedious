// s2.2.7.17

import Parser, { type TokenReader } from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';

import { isPLPStream, PLPReader, readValue } from '../value-parser';

export interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

/**
 * Reads the column values of a row one by one. Column values - especially PLP
 * values - can be arbitrarily large, so the progress is kept across chunks.
 */
export class ColumnValuesReader {
  declare columns: Column[];

  // The reader of a PLP column value that is not complete yet.
  declare plpReader: PLPReader | undefined;

  constructor() {
    this.columns = [];
    this.plpReader = undefined;
  }

  /**
   * Read the remaining column values. Columns flagged in the `nullBitmap`
   * have no data and are `null`.
   */
  readColumns(parser: Parser, nullBitmap: Buffer | undefined) {
    const colMetadata = parser.colMetadata;

    while (this.columns.length < colMetadata.length) {
      const index = this.columns.length;
      const metadata = colMetadata[index];

      let value;
      if (nullBitmap !== undefined && (nullBitmap[index >> 3] & (1 << (index & 7)))) {
        value = null;
      } else if (isPLPStream(metadata)) {
        this.plpReader ??= new PLPReader(metadata);
        value = this.plpReader.read(parser);
        this.plpReader = undefined;
      } else {
        const result = readValue(parser.buffer, parser.position, metadata, parser.options);
        parser.position = result.offset;
        value = result.value;
      }

      this.columns.push({ value, metadata });
    }
  }
}

/**
 * Reads a `ROW` token.
 */
export class RowTokenReader extends ColumnValuesReader implements TokenReader {
  read(parser: Parser): RowToken {
    this.readColumns(parser, undefined);
    return new RowToken(parser.options.useColumnNames ? toColumnsMap(this.columns) : this.columns);
  }
}

/**
 * Map columns by name. If multiple columns share a name, the first one wins.
 */
export function toColumnsMap(columns: Column[]): { [key: string]: Column } {
  const columnsMap: { [key: string]: Column } = Object.create(null);

  for (const column of columns) {
    const colName = column.metadata.colName;
    if (columnsMap[colName] == null) {
      columnsMap[colName] = column;
    }
  }

  return columnsMap;
}
