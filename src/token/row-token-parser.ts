// s2.2.7.17

import Parser, { type TokenReader } from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { ColumnValueToken, RowEndToken, RowStartToken, RowToken, Token, ValueChunkToken, ValueEndToken, ValueStartToken } from './token';
import { NotEnoughDataError } from './helpers';

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
      if (nullBitmap !== undefined && isNull(nullBitmap, index)) {
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
 * Reads a `ROW` or `NBCROW` token as a sequence of tokens (see
 * `RowStartToken`), streaming PLP values piece by piece instead of reading
 * them as a whole.
 */
export class StreamedRowReader implements TokenReader {
  declare hasMore: boolean;

  declare hasNullBitmap: boolean;
  declare nullBitmap: Buffer | undefined;

  declare started: boolean;
  declare index: number;

  // The reader of the PLP value that is currently being streamed.
  declare plpReader: PLPReader | undefined;

  constructor(hasNullBitmap: boolean) {
    this.hasMore = true;

    this.hasNullBitmap = hasNullBitmap;
    this.nullBitmap = undefined;

    this.started = false;
    this.index = 0;

    this.plpReader = undefined;
  }

  read(parser: Parser): Token {
    if (!this.started) {
      if (this.hasNullBitmap) {
        this.nullBitmap = readNullBitmap(parser);
      }

      this.started = true;
      return new RowStartToken();
    }

    if (this.plpReader !== undefined) {
      const data = this.plpReader.readChunk(parser);
      if (data !== undefined) {
        return new ValueChunkToken(data);
      }

      this.plpReader = undefined;
      this.index += 1;
      return new ValueEndToken();
    }

    const colMetadata = parser.colMetadata;
    if (this.index === colMetadata.length) {
      this.hasMore = false;
      return new RowEndToken();
    }

    const index = this.index;
    const metadata = colMetadata[index];

    let value;
    if (this.nullBitmap !== undefined && isNull(this.nullBitmap, index)) {
      value = null;
    } else if (isPLPStream(metadata)) {
      const plpReader = new PLPReader(metadata);
      plpReader.readLength(parser);

      if (!plpReader.isNull) {
        this.plpReader = plpReader;
        return new ValueStartToken(index, metadata, plpReader.totalLength);
      }

      value = null;
    } else {
      const result = readValue(parser.buffer, parser.position, metadata, parser.options);
      parser.position = result.offset;
      value = result.value;
    }

    this.index += 1;
    return new ColumnValueToken(index, metadata, value);
  }
}

/**
 * Read the bitmap that precedes the column values of an `NBCROW` token, and
 * flags which columns are `null` (and have no data).
 */
export function readNullBitmap(parser: Parser): Buffer {
  const start = parser.position;
  const end = start + Math.ceil(parser.colMetadata.length / 8);
  if (parser.buffer.length < end) {
    throw new NotEnoughDataError(end);
  }

  parser.position = end;
  return parser.buffer.subarray(start, end);
}

function isNull(nullBitmap: Buffer, index: number): boolean {
  return (nullBitmap[index >> 3] & (1 << (index & 7))) !== 0;
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
