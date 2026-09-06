import Parser, { type ParserOptions } from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';
import { isPLPStream, readPLPValue, readValue, type PLPState } from '../value-parser';

export interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

/**
 * The progress of a row or NBC row token being parsed.
 *
 * A row can span many packets, so instead of parsing it from the start
 * again whenever more data arrives, the columns parsed so far are kept
 * here, and the parser's position is committed after every column (and
 * after every chunk of a PLP value).
 */
export class RowState {
  declare columns: Column[];
  /**
   * The index of the next column to parse.
   */
  declare index: number;
  /**
   * The progress of the PLP value of column `index`, if any.
   */
  declare plp: PLPState | undefined;
  /**
   * The null bitmap of an NBC row.
   */
  declare bitmap: Buffer | undefined;

  constructor(columnCount: number) {
    this.columns = new Array(columnCount);
    this.index = 0;
    this.plp = undefined;
    this.bitmap = undefined;
  }

  /**
   * Reads the value of the next column from the parser and commits the
   * parser's position past it.
   */
  readColumn(parser: Parser, metadata: ColumnMetadata) {
    let value;
    if (isPLPStream(metadata)) {
      value = readPLPValue(parser, this, metadata);
    } else {
      const result = readValue(parser.buffer, parser.position, metadata, parser.options);
      parser.position = result.offset;
      value = result.value;
    }

    this.columns[this.index] = { value, metadata };
    this.index += 1;
    parser.commit();
  }

  /**
   * Records the next column as `NULL` (for NBC rows).
   */
  skipColumn(metadata: ColumnMetadata) {
    this.columns[this.index] = { value: null, metadata };
    this.index += 1;
  }

  /**
   * The parsed columns, as an array or, with `useColumnNames`, as a map by
   * column name.
   */
  finish(options: ParserOptions): Column[] | { [key: string]: Column } {
    if (!options.useColumnNames) {
      return this.columns;
    }

    const columnsMap: { [key: string]: Column } = Object.create(null);

    for (const column of this.columns) {
      const colName = column.metadata.colName;
      if (columnsMap[colName] == null) {
        columnsMap[colName] = column;
      }
    }

    return columnsMap;
  }
}
