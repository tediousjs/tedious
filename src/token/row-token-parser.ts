// s2.2.7.17

import Parser, { type TokenReader } from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { ColumnValueToken, NBCRowToken, RowEndToken, RowStartToken, RowToken, Token, ValueChunkToken, ValueEndToken, ValueStartToken } from './token';
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
 * Reads a `ROW` or `NBCROW` token, streaming PLP values piece by piece instead
 * of reading them as a whole.
 *
 * A row without any (non-`null`) PLP values is returned as a single `ROW` or
 * `NBCROW` token. Otherwise, the row is returned as a sequence of tokens,
 * starting with a `RowStartToken` (see there).
 */
export class StreamedRowReader implements TokenReader {
  declare hasMore: boolean;

  declare hasNullBitmap: boolean;
  declare nullBitmap: Buffer | undefined;

  // The values read before the first streamed value.
  declare columns: Column[];
  // The index of the next column to read.
  declare index: number;
  // Whether the `RowStartToken` was returned.
  declare started: boolean;

  // The reader of the PLP value whose length is being read.
  declare nextPLPReader: PLPReader | undefined;
  // The reader of the PLP value that is currently being streamed.
  declare plpReader: PLPReader | undefined;
  // Whether the `ValueStartToken` of `plpReader`'s value is yet to be returned.
  declare valueStartPending: boolean;

  constructor(hasNullBitmap: boolean) {
    this.hasMore = true;

    this.hasNullBitmap = hasNullBitmap;
    this.nullBitmap = undefined;

    this.columns = [];
    this.index = 0;
    this.started = false;

    this.nextPLPReader = undefined;
    this.plpReader = undefined;
    this.valueStartPending = false;
  }

  read(parser: Parser): Token {
    if (this.plpReader !== undefined) {
      return this.readPLPValue(parser, this.plpReader);
    }

    if (this.hasNullBitmap) {
      this.nullBitmap ??= readNullBitmap(parser);
    }

    const colMetadata = parser.colMetadata;

    while (this.index < colMetadata.length) {
      const index = this.index;
      const metadata = colMetadata[index];

      let value;
      if (this.nullBitmap !== undefined && isNull(this.nullBitmap, index)) {
        value = null;
      } else if (isPLPStream(metadata)) {
        const plpReader = this.nextPLPReader ??= new PLPReader(metadata);
        plpReader.readLength(parser);
        this.nextPLPReader = undefined;

        if (!plpReader.isNull) {
          this.plpReader = plpReader;
          this.valueStartPending = true;

          if (!this.started) {
            this.started = true;
            return new RowStartToken(this.columns);
          }

          return this.readPLPValue(parser, plpReader);
        }

        value = null;
      } else {
        const result = readValue(parser.buffer, parser.position, metadata, parser.options);
        parser.position = result.offset;
        value = result.value;
      }

      this.index += 1;

      if (this.started) {
        return new ColumnValueToken(index, metadata, value);
      }

      this.columns.push({ value, metadata });
    }

    this.hasMore = false;

    if (this.started) {
      return new RowEndToken();
    }

    const columns = parser.options.useColumnNames ? toColumnsMap(this.columns) : this.columns;
    return this.hasNullBitmap ? new NBCRowToken(columns) : new RowToken(columns);
  }

  readPLPValue(parser: Parser, plpReader: PLPReader): Token {
    if (this.valueStartPending) {
      this.valueStartPending = false;
      return new ValueStartToken(this.index, parser.colMetadata[this.index], plpReader.totalLength);
    }

    const data = plpReader.readChunk(parser);
    if (data !== undefined) {
      return new ValueChunkToken(data);
    }

    this.plpReader = undefined;
    this.index += 1;
    return new ValueEndToken();
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
