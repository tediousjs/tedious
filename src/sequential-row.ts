import { type ColumnMetadata } from './token/colmetadata-token-parser';
import type Parser from './token/stream-parser';

import { buildPLPDecoder, buildValueReader, readPLPStream, PLPStreamReader } from './value-parser';
import { NotEnoughDataError } from './token/helpers';

/**
 * Marks a cell whose data was consumed (streamed or drained) and is no
 * longer available.
 */
const CONSUMED = Symbol('consumed');

/**
 * A row that is consumed sequentially, in wire order, allowing large (PLP
 * streamed) values to be read as a stream of chunks instead of being
 * materialized.
 *
 * Cells are parsed on demand as they are accessed. Accessing a cell parses
 * (and caches) all earlier unaccessed non-PLP cells; earlier unaccessed PLP
 * cells are skipped at wire speed without materializing them and can no
 * longer be accessed afterwards.
 *
 * The parser does not continue past this row until `finish()` was called
 * (the sequential row iterator does this when it is advanced), which drains
 * any unconsumed cells.
 */
export class SequentialRow {
  declare readonly columns: ColumnMetadata[];

  /**
   * Resolved once the row was fully consumed - the parse loop waits for
   * this before parsing further tokens.
   */
  declare readonly completion: Promise<void>;

  declare private parser: Parser;
  declare private bitmap: Buffer | null;
  declare private nextColumn: number;
  declare private cache: unknown[];
  declare private activeStream: PLPStreamReader | null;
  declare private activeStreamColumn: number;
  declare private finishPromise: Promise<void> | null;
  declare private resolveCompletion: () => void;

  /**
   * Reads the (optional) NBC null bitmap and creates the row handle.
   */
  static async create(parser: Parser, isNbcRow: boolean): Promise<SequentialRow> {
    let bitmap: Buffer | null = null;

    if (isNbcRow) {
      const bitmapByteLength = Math.ceil(parser.colMetadata.length / 8);

      while (parser.buffer.length - parser.position < bitmapByteLength) {
        await parser.waitForChunk();
      }

      bitmap = Buffer.from(parser.buffer.subarray(parser.position, parser.position + bitmapByteLength));
      parser.position += bitmapByteLength;
    }

    return new SequentialRow(parser, bitmap);
  }

  private constructor(parser: Parser, bitmap: Buffer | null) {
    this.parser = parser;
    this.columns = parser.colMetadata;
    this.bitmap = bitmap;

    this.nextColumn = 0;
    this.cache = [];
    this.activeStream = null;
    this.activeStreamColumn = -1;
    this.finishPromise = null;

    let resolveCompletion!: () => void;
    this.completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    this.resolveCompletion = resolveCompletion;
  }

  /**
   * Returns the materialized value of the given column.
   *
   * Non-PLP values are cached and can be accessed again in any order. A PLP
   * value is materialized when it is accessed at its position; once passed
   * (drained or streamed), accessing it throws.
   */
  async value(columnIndex: number): Promise<unknown> {
    this.checkColumnIndex(columnIndex);
    await this.settleActiveStream();

    if (columnIndex < this.nextColumn) {
      const value = this.cache[columnIndex];
      if (value === CONSUMED) {
        throw new Error(`Column ${columnIndex} was already consumed and is no longer available`);
      }

      return value;
    }

    while (this.nextColumn < columnIndex) {
      await this.parseNextCell(false);
    }

    await this.parseNextCell(true);

    return this.cache[columnIndex];
  }

  /**
   * Positions at the given PLP streamed column and returns an async
   * iterable over the value's chunks (copies, safe to retain), or `null`
   * when the value is NULL.
   *
   * The stream is live only until a later column is accessed, the row is
   * finished, or another stream is started - anything left unconsumed at
   * that point is skipped.
   */
  async stream(columnIndex: number): Promise<AsyncIterableIterator<Buffer> | null> {
    this.checkColumnIndex(columnIndex);

    const metadata = this.columns[columnIndex];
    let reader = metadata.reader;
    if (reader === undefined) {
      reader = metadata.reader = buildValueReader(metadata, this.parser.options);
    }

    if (reader !== null) {
      throw new TypeError(`Column ${columnIndex} is not a streamable (PLP) column - use \`value()\` instead`);
    }

    await this.settleActiveStream();

    if (columnIndex < this.nextColumn) {
      throw new Error(`Column ${columnIndex} was already consumed and is no longer available`);
    }

    while (this.nextColumn < columnIndex) {
      await this.parseNextCell(false);
    }

    if (this.isNull(columnIndex)) {
      this.cache[columnIndex] = null;
      this.nextColumn = columnIndex + 1;
      return null;
    }

    const plpReader = new PLPStreamReader(this.parser);
    if (!(await plpReader.start())) {
      this.cache[columnIndex] = null;
      this.nextColumn = columnIndex + 1;
      return null;
    }

    this.cache[columnIndex] = CONSUMED;
    this.activeStream = plpReader;
    this.activeStreamColumn = columnIndex;

    const iterator: AsyncIterableIterator<Buffer> = {
      [Symbol.asyncIterator]() {
        return iterator;
      },

      next: async (): Promise<IteratorResult<Buffer, undefined>> => {
        if (this.activeStream !== plpReader) {
          // The stream was invalidated by accessing a later column.
          return { value: undefined, done: true };
        }

        const piece = await plpReader.next();
        if (piece === null) {
          this.activeStream = null;
          this.nextColumn = columnIndex + 1;
          return { value: undefined, done: true };
        }

        return { value: piece, done: false };
      },

      return: async (): Promise<IteratorResult<Buffer, undefined>> => {
        // The rest of the value is skipped when the row advances.
        return { value: undefined, done: true };
      }
    };

    return iterator;
  }

  /**
   * Drains all unconsumed cells of the row, allowing the parser to continue
   * with the next token. Idempotent.
   */
  finish(): Promise<void> {
    if (this.finishPromise === null) {
      this.finishPromise = (async () => {
        await this.settleActiveStream();

        while (this.nextColumn < this.columns.length) {
          await this.parseNextCell(false);
        }

        this.resolveCompletion();
      })();
    }

    return this.finishPromise;
  }

  private checkColumnIndex(columnIndex: number) {
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= this.columns.length) {
      throw new RangeError(`Invalid column index ${columnIndex}`);
    }

    if (this.finishPromise !== null && columnIndex >= this.nextColumn) {
      throw new Error('The row was already finished');
    }
  }

  private isNull(columnIndex: number) {
    return this.bitmap !== null && ((this.bitmap[columnIndex >>> 3] >>> (columnIndex & 0b111)) & 0b1) === 1;
  }

  /**
   * Skips the remainder of the currently active value stream.
   */
  private async settleActiveStream() {
    const activeStream = this.activeStream;
    if (activeStream !== null) {
      this.activeStream = null;
      await activeStream.drain();
      this.nextColumn = this.activeStreamColumn + 1;
    }
  }

  /**
   * Parses the cell at `nextColumn`. Non-PLP values are materialized into
   * the cache; PLP values are materialized when `materializePLP` is set and
   * skipped (and marked as consumed) otherwise.
   */
  private async parseNextCell(materializePLP: boolean) {
    const columnIndex = this.nextColumn;
    const metadata = this.columns[columnIndex];
    const parser = this.parser;

    if (this.isNull(columnIndex)) {
      this.cache[columnIndex] = null;
      this.nextColumn = columnIndex + 1;
      return;
    }

    let reader = metadata.reader;
    if (reader === undefined) {
      reader = metadata.reader = buildValueReader(metadata, parser.options);
    }

    if (reader === null) {
      if (materializePLP) {
        const chunks = await readPLPStream(parser);

        let plpDecoder = metadata.plpDecoder;
        if (plpDecoder === undefined) {
          plpDecoder = metadata.plpDecoder = buildPLPDecoder(metadata, parser.options);
        }

        this.cache[columnIndex] = plpDecoder(chunks);
      } else {
        const plpReader = new PLPStreamReader(parser);
        if (await plpReader.start()) {
          await plpReader.drain();
          this.cache[columnIndex] = CONSUMED;
        } else {
          this.cache[columnIndex] = null;
        }
      }

      this.nextColumn = columnIndex + 1;
      return;
    }

    while (true) {
      let result;
      try {
        result = reader(parser.buffer, parser.position);
      } catch (err) {
        if (err instanceof NotEnoughDataError) {
          await parser.waitForChunk();
          continue;
        }

        throw err;
      }

      parser.position = result.offset;
      this.cache[columnIndex] = result.value;
      this.nextColumn = columnIndex + 1;
      return;
    }
  }
}
