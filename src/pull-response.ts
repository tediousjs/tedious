import { Readable } from 'stream';

import type Debug from './debug';
import type Request from './request';
import type { PulledRequest } from './request';
import type Connection from './connection';
import { RequestError } from './errors';
import { type Metadata } from './metadata-parser';
import { decodePLPValue, isPLPStream } from './value-parser';
import StreamParser, { type ParserOptions } from './token/stream-parser';
import { type ColumnMetadata } from './token/colmetadata-token-parser';
import { type TokenHandler } from './token/handler';
import {
  ColMetadataToken,
  ColumnValueToken,
  DoneInProcToken,
  DoneProcToken,
  DoneToken,
  ReturnStatusToken,
  ReturnValueStartToken,
  ReturnValueToken,
  RowEndToken,
  RowStartToken,
  type Token,
  ValueChunkToken,
  ValueEndToken,
  ValueStartToken
} from './token/token';

const DONE: IteratorReturnResult<undefined> = Object.freeze({ done: true, value: undefined });
const DONE_PROMISE = Promise.resolve(DONE);

// Marks a value that was streamed (or skipped) instead of read.
const STREAMED = Symbol('streamed');

/**
 * Reads the tokens of a response message on demand.
 *
 * Tokens that the consumer of the response pulls (result sets, rows, values
 * and output parameters) are returned by `next`. All other tokens are passed
 * to the request's token handler as they are read, which keeps track of
 * errors, row counts and the connection's state (e.g. transactions), just
 * like for responses consumed via events.
 */
export class ResponseReader {
  declare parser: StreamParser;
  declare iterator: AsyncIterator<Buffer>;
  declare handler: TokenHandler;
  declare debug: Debug;

  // A token that was pushed back via `unread`.
  declare lookahead: Token | undefined;

  // Set while a read waits for more data. Reads are processed one at a time.
  declare busy: Promise<Token | null> | undefined;

  declare ended: boolean;
  declare error: Error | undefined;

  // The status returned by a called procedure, if any.
  declare returnStatus: number | undefined;

  // Called once the whole message was read, or reading it failed.
  declare onEnd: (error?: Error) => void;

  constructor(message: AsyncIterable<Buffer>, handler: TokenHandler, debug: Debug, options: ParserOptions) {
    // Rows are accessed by column index, so they are always read as arrays.
    // The options are inherited (rather than copied), so later changes to
    // the connection's options still apply.
    const parserOptions: ParserOptions = Object.create(options, { useColumnNames: { value: false } });

    this.parser = new StreamParser(parserOptions);
    this.parser.streamValues = true;
    this.iterator = message[Symbol.asyncIterator]();
    this.handler = handler;
    this.debug = debug;

    this.lookahead = undefined;
    this.busy = undefined;
    this.ended = false;
    this.error = undefined;
    this.returnStatus = undefined;
    this.onEnd = () => {};
  }

  /**
   * Return the next token, if it can be read from the data received so far.
   *
   * Returns `null` at the end of the message, or `undefined` if more data
   * needs to be received first (use `next` then).
   */
  nextSync(): Token | null | undefined {
    const lookahead = this.lookahead;
    if (lookahead !== undefined) {
      this.lookahead = undefined;
      return lookahead;
    }

    if (this.error !== undefined) {
      throw this.error;
    }

    if (this.busy !== undefined) {
      return undefined;
    }

    if (this.ended) {
      return null;
    }

    try {
      return this.readBuffered();
    } catch (err: any) {
      throw this.fail(err);
    }
  }

  /**
   * Return the next token, or `null` at the end of the message.
   */
  async next(): Promise<Token | null> {
    while (this.busy !== undefined) {
      await this.busy.catch(() => {});
    }

    const token = this.nextSync();
    if (token !== undefined) {
      return token;
    }

    const busy = this.busy = this.receive();
    try {
      return await busy;
    } finally {
      this.busy = undefined;
    }
  }

  /**
   * Push back a token, to be returned by the next read.
   */
  unread(token: Token) {
    this.lookahead = token;
  }

  /**
   * Read (and discard) the rest of the message.
   */
  async drain() {
    try {
      while (await this.next() !== null) {
        // discard
      }
    } catch {
      // Reported via `onEnd`.
    }
  }

  /**
   * Fail all further reads with the given error, without reporting it (the
   * request already completed with it).
   */
  abort(error: Error) {
    if (this.error === undefined && !this.ended) {
      this.error = error;
    }
  }

  /**
   * Fail all further reads with the given error.
   */
  fail(error: Error): Error {
    if (this.error === undefined && !this.ended) {
      this.error = error;
      this.onEnd(error);
    }

    return error;
  }

  async receive(): Promise<Token | null> {
    try {
      while (true) {
        const result = await this.iterator.next();

        if (this.error !== undefined) {
          throw this.error;
        }

        if (result.done) {
          this.parser.end();
          this.ended = true;
          this.onEnd();
          return null;
        }

        this.parser.write(result.value);

        const token = this.readBuffered();
        if (token !== undefined) {
          return token;
        }
      }
    } catch (err: any) {
      throw this.fail(err);
    }
  }

  readBuffered(): Token | undefined {
    const parser = this.parser;
    const handler = this.handler;

    let token;
    while ((token = parser.read()) !== undefined) {
      this.debug.token(token);

      switch (token.handlerName) {
        // Tokens that are only consumed by the response's consumer.
        case 'onRow':
        case 'onRowStart':
        case 'onColumnValue':
        case 'onValueStart':
        case 'onValueChunk':
        case 'onValueEnd':
        case 'onRowEnd':
        case 'onReturnValueStart':
          return token;

        // Tokens that the consumer needs to see, but that also affect the
        // request's state.
        case 'onColMetadata':
        case 'onDone':
        case 'onDoneInProc':
        case 'onDoneProc':
        case 'onReturnValue':
          handler[token.handlerName](token as any);
          return token;

        case 'onReturnStatus':
          this.returnStatus = (token as ReturnStatusToken).value;
          handler.onReturnStatus(token as ReturnStatusToken);
          break;

        default:
          handler[token.handlerName](token as any);
      }
    }

    return undefined;
  }
}

// Operations on the response run synchronously as long as the data they need
// was already received, and only return a promise once they need to wait for
// more data. This avoids the cost of a promise per step, e.g. per row.
type MaybePromise<T> = T | Promise<T>;

/**
 * Wait until the next token was received, and make it available via
 * `nextSync` again.
 */
function waitForToken(reader: ResponseReader): Promise<void> {
  return reader.next().then((token) => {
    if (token !== null) {
      reader.unread(token);
    }
  });
}

/**
 * Values that are read one after the other: the columns of a row, or the
 * output parameters of a request.
 *
 * Values before the first streamed (PLP) value are read right away and can
 * be accessed synchronously via `get`. Values from there on are read on
 * demand, in order: via `stream` or `read`, which skip any values in
 * between.
 */
abstract class ValueSequence {
  declare response: Response;

  declare items: Array<{ value: unknown, metadata: Metadata }>;
  declare complete: boolean;

  // The streamed value that is up next, once its start has been read.
  declare pending: { name: string, metadata: Metadata, length: number | undefined } | undefined;
  // The data of the pending value read so far, when reading it in full.
  declare pendingChunks: Buffer[];
  declare pendingLength: number;

  // The stream of the value currently being streamed, and its pump.
  declare activeStream: Readable | undefined;
  declare pumping: Promise<void> | undefined;

  constructor(response: Response, items: Array<{ value: unknown, metadata: Metadata }>, complete: boolean) {
    this.response = response;
    this.items = items;
    this.complete = complete;
    this.pending = undefined;
    this.pendingChunks = [];
    this.pendingLength = 0;
    this.activeStream = undefined;
    this.pumping = undefined;
  }

  /**
   * The position of the value with the given key among the values read so
   * far (or `items.length` for the pending value), or `-1` if it was not
   * read yet and its position is not known yet.
   */
  abstract indexOf(key: number | string): number;

  /**
   * Read ahead until the position of the value with the given key is known,
   * and the value is either read or pending.
   */
  abstract locate(key: number | string): MaybePromise<number>;

  // Apply a token that was read.
  abstract accept(token: Token): void;

  // Called when the pending value was read, streamed or skipped.
  addPendingItem(value: unknown) {
    this.items.push({ value, metadata: this.pending!.metadata });
    this.pending = undefined;
  }

  /**
   * The value of an already read value.
   */
  get(key: number | string): unknown {
    const index = this.indexOf(key);
    const item = index >= 0 ? this.items[index] : undefined;

    if (item !== undefined && item.value !== STREAMED) {
      return item.value;
    }

    throw this.unavailable(key, index);
  }

  /**
   * The total length in bytes of a streamed value that is up next, if the
   * server announced it.
   */
  length(key: number | string): number | undefined {
    const index = this.indexOf(key);
    return this.pending !== undefined && index === this.items.length ? this.pending.length : undefined;
  }

  /**
   * Read a value in full, skipping any unread values before it.
   */
  read(key: number | string): Promise<unknown> {
    try {
      return Promise.resolve(this.readValue(key));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  readValue(key: number | string): MaybePromise<unknown> {
    const index = this.locate(key);
    if (typeof index !== 'number') {
      return index.then(() => this.readValue(key));
    }

    if (index === this.items.length && this.pending !== undefined) {
      const reading = this.readPendingValue();
      if (reading !== undefined) {
        return reading.then(() => this.readValue(key));
      }
    }

    const readingAhead = this.readAhead();
    if (readingAhead !== undefined) {
      return readingAhead.then(() => this.get(key));
    }

    return this.get(key);
  }

  /**
   * Stream the raw data of a value of a `max` type, skipping any unread
   * values before it. Resolves to `null` if the value is `null`.
   */
  stream(key: number | string): Promise<Readable | null> {
    try {
      return Promise.resolve(this.streamValue(key));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  streamValue(key: number | string): MaybePromise<Readable | null> {
    const index = this.locate(key);
    if (typeof index !== 'number') {
      return index.then(() => this.streamValue(key));
    }

    if (index < this.items.length) {
      const item = this.items[index];

      if (!isPLPStream(item.metadata)) {
        throw new Error(`The value of \`${key}\` is not of a \`max\` type, and can not be streamed. Use \`get()\` instead.`);
      }

      if (item.value === null) {
        return null;
      }

      throw this.unavailable(key, index);
    }

    if (index > this.items.length || this.pending === undefined) {
      throw new Error(`The value of \`${key}\` is not available.`);
    }

    const stream = new Readable({
      read: () => {
        if (this.pumping !== undefined) {
          return;
        }

        this.pumping = this.pump(stream).catch((err) => {
          stream.destroy(err);
        }).finally(() => {
          this.pumping = undefined;
        });
      }
    });

    this.activeStream = stream;
    return stream;
  }

  /**
   * Push the data of the pending value into its stream, until the stream
   * does not accept more data or the value ended.
   */
  async pump(stream: Readable) {
    const reader = this.response.reader!;

    while (true) {
      let token = reader.nextSync();
      if (token === undefined) {
        token = await reader.next();
      }

      if (stream.destroyed) {
        if (token !== null) {
          reader.unread(token);
        }
        return;
      }

      if (token instanceof ValueChunkToken) {
        if (!stream.push(token.data)) {
          return;
        }

        continue;
      }

      if (token instanceof ValueEndToken) {
        this.addPendingItem(STREAMED);
        this.activeStream = undefined;

        // Read the values after this one, so they are available via
        // `get` once the stream ended.
        await this.readAhead();
        stream.push(null);
        return;
      }

      throw await this.interrupted();
    }
  }

  /**
   * Read ahead until the next streamed value, or the end of the values.
   */
  readAhead(): MaybePromise<void> {
    const reader = this.response.reader!;

    while (!this.complete && this.pending === undefined) {
      const token = reader.nextSync();
      if (token === undefined) {
        return waitForToken(reader).then(() => this.readAhead());
      }

      this.receive(token);
    }
  }

  receive(token: Token | null) {
    if (token === null) {
      this.complete = true;
    } else {
      this.accept(token);
    }
  }

  /**
   * Read all values that were not read yet in full.
   */ readRemaining(): MaybePromise<void> {
    while (true) {
      if (this.pending !== undefined) {
        const reading = this.readPendingValue();
        if (reading !== undefined) {
          return reading.then(() => this.readRemaining());
        }
      } else if (this.complete) {
        return;
      } else {
        const readingAhead = this.readAhead();
        if (readingAhead !== undefined) {
          return readingAhead.then(() => this.readRemaining());
        }
      }
    }
  }

  /**
   * Skip values until at least `count` values were read (or skipped).
   */
  skipTo(count: number): MaybePromise<void> {
    const reader = this.response.reader!;

    while (this.items.length < count && !this.complete) {
      if (this.pending !== undefined) {
        const skipping = this.skipPendingValue();
        if (skipping !== undefined) {
          return skipping.then(() => this.skipTo(count));
        }
      } else {
        const token = reader.nextSync();
        if (token === undefined) {
          return waitForToken(reader).then(() => this.skipTo(count));
        }

        this.receive(token);
      }
    }
  }

  /**
   * Skip all values that were not read yet.
   */
  skipRest(): MaybePromise<void> {
    return this.skipTo(Infinity);
  }

  skipPendingValue(): MaybePromise<void> {
    const stream = this.activeStream;
    if (stream !== undefined) {
      this.activeStream = undefined;
      stream.destroy(new Error('The value was skipped before it was read completely.'));
      return Promise.resolve(this.pumping).then(() => this.skipPendingValue());
    }

    const reader = this.response.reader!;

    while (true) {
      const token = reader.nextSync();
      if (token === undefined) {
        return waitForToken(reader).then(() => this.skipPendingValue());
      }

      if (token instanceof ValueEndToken) {
        this.addPendingItem(STREAMED);
        return;
      }

      if (!(token instanceof ValueChunkToken)) {
        return this.interrupted().then((error) => {
          throw error;
        });
      }
    }
  }

  readPendingValue(): MaybePromise<void> {
    const reader = this.response.reader!;

    while (true) {
      const token = reader.nextSync();
      if (token === undefined) {
        return waitForToken(reader).then(() => this.readPendingValue());
      }

      if (token instanceof ValueChunkToken) {
        this.pendingChunks.push(token.data);
        this.pendingLength += token.data.length;
        continue;
      }

      if (token instanceof ValueEndToken) {
        const value = decodePLPValue(this.pendingChunks, this.pendingLength, this.pending!.metadata);
        this.pendingChunks = [];
        this.pendingLength = 0;
        this.addPendingItem(value);
        return;
      }

      return this.interrupted().then((error) => {
        throw error;
      });
    }
  }

  /**
   * The error to raise if the response ended in the middle of a value (e.g.
   * because the request was canceled).
   */
  async interrupted(): Promise<Error> {
    const response = this.response;
    await response.completion;
    return response.completionError ?? new RequestError('The response ended unexpectedly.', 'EINVALIDSTATE');
  }

  unavailable(key: number | string, index: number): Error {
    if (index >= 0 && index < this.items.length) {
      return new Error(`The value of \`${key}\` was streamed, and can not be accessed anymore.`);
    }

    const pending = this.pending?.name;
    if (pending === undefined) {
      return new Error(`The value of \`${key}\` is not available.`);
    }

    return new Error(
      `The value of \`${key}\` was not read yet, as it comes after the value of \`${pending}\`, which has not been read yet. ` +
      `Consume \`stream('${pending}')\` first, or use \`await read('${key}')\`.`
    );
  }
}

/**
 * A row of a result set.
 *
 * A row is only valid until the next row is requested: moving on skips all
 * values that were not read yet.
 */
export class Row extends ValueSequence {
  declare resultSet: ResultSet;

  constructor(resultSet: ResultSet, columns: Array<{ value: unknown, metadata: Metadata }>, complete: boolean) {
    super(resultSet.response, columns, complete);
    this.resultSet = resultSet;
  }

  indexOf(key: number | string): number {
    return this.resultSet.indexOf(key);
  }

  locate(key: number | string): MaybePromise<number> {
    const index = this.indexOf(key);

    if (index >= this.items.length) {
      const skipping = this.skipTo(index);
      if (skipping !== undefined) {
        return skipping.then(() => this.locate(key));
      }

      const readingAhead = this.readAhead();
      if (readingAhead !== undefined) {
        return readingAhead.then(() => index);
      }
    }

    return index;
  }

  accept(token: Token) {
    if (token instanceof ColumnValueToken) {
      this.items.push({ value: token.value, metadata: token.metadata });
    } else if (token instanceof ValueStartToken) {
      this.pending = { name: this.resultSet.columns[token.index].colName, metadata: token.metadata, length: token.length };
    } else if (token instanceof RowEndToken) {
      this.complete = true;
    } else {
      throw new Error('Unexpected token `' + token.name + '` in a row.');
    }
  }

  /**
   * All values of the row, which must have been read completely. That is
   * the case for rows without `max` values - otherwise, use
   * [[readValues]].
   */
  values(): unknown[] {
    if (!this.complete || this.pending !== undefined || this.items.length < this.resultSet.columns.length) {
      throw new Error('The row was not read completely. Use `await readValues()` to read all of its values.');
    }

    return this.items.map((item, index) => {
      if (item.value === STREAMED) {
        throw this.unavailable(index, index);
      }

      return item.value;
    });
  }

  /**
   * Read all remaining values of the row in full (including `max` values),
   * and return all values of the row.
   *
   * Values that were already streamed can not be returned anymore.
   */
  readValues(): Promise<unknown[]> {
    try {
      const reading = this.readRemaining();
      return reading !== undefined ? reading.then(() => this.values()) : Promise.resolve(this.values());
    } catch (err) {
      return Promise.reject(err);
    }
  }

}

/**
 * A result set, which is an async iterator of its rows.
 */
export class ResultSet implements AsyncIterableIterator<Row> {
  declare response: Response;
  declare columns: ColumnMetadata[];

  /**
   * The number of rows, once all rows were read.
   */
  declare rowCount: number | undefined;

  declare done: boolean;
  declare current: Row | undefined;
  declare columnIndexes: Map<string, number> | undefined;

  constructor(response: Response, columns: ColumnMetadata[]) {
    this.response = response;
    this.columns = columns;
    this.rowCount = undefined;
    this.done = false;
    this.current = undefined;
    this.columnIndexes = undefined;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  indexOf(key: number | string): number {
    if (typeof key === 'number') {
      if (key >= 0 && key < this.columns.length) {
        return key;
      }
    } else {
      let indexes = this.columnIndexes;
      if (indexes === undefined) {
        indexes = this.columnIndexes = new Map();
        for (let i = this.columns.length - 1; i >= 0; i--) {
          indexes.set(this.columns[i].colName, i);
        }
      }

      const index = indexes.get(key);
      if (index !== undefined) {
        return index;
      }
    }

    throw new Error(`Unknown column \`${key}\`.`);
  }

  next(): Promise<IteratorResult<Row, undefined>> {
    try {
      return Promise.resolve(this.nextRow());
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Advance to the next row, skipping the rest of the current one.
   */
  nextRow(): MaybePromise<IteratorResult<Row, undefined>> {
    if (this.done) {
      return DONE;
    }

    const current = this.current;
    if (current !== undefined && !current.complete) {
      const skipping = current.skipRest();
      if (skipping !== undefined) {
        return skipping.then(() => this.nextRow());
      }
    }

    const reader = this.response.reader!;
    const token = reader.nextSync();
    if (token === undefined) {
      return waitForToken(reader).then(() => this.nextRow());
    }

    const result = this.handle(token);

    const row = this.current;
    if (!result.done && !row!.complete) {
      // Read up to the row's first streamed value.
      const readingAhead = row!.readAhead();
      if (readingAhead !== undefined) {
        return readingAhead.then(() => result);
      }
    }

    return result;
  }

  handle(token: Token | null): IteratorResult<Row, undefined> {
    if (token !== null) {
      switch (token.handlerName) {
        case 'onRow':
          return { done: false, value: this.current = new Row(this, (token as any).columns, true) };

        case 'onRowStart':
          return { done: false, value: this.current = new Row(this, (token as RowStartToken).columns, false) };

        case 'onDone':
        case 'onDoneInProc':
        case 'onDoneProc':
          this.rowCount = (token as DoneToken | DoneInProcToken | DoneProcToken).rowCount;
          break;

        default:
          // e.g. the next result set, or output parameters.
          this.response.reader!.unread(token);
      }
    }

    this.done = true;
    this.current = undefined;
    return DONE;
  }

  /**
   * Skip the rest of the result set.
   */
  skipRest(): MaybePromise<void> {
    while (true) {
      const result = this.nextRow();

      if (result instanceof Promise) {
        return result.then(() => this.skipRest());
      }

      if (result.done) {
        return;
      }
    }
  }

  /**
   * Stop iterating the result set. Its remaining rows are skipped once the
   * response is read further.
   */
  return(): Promise<IteratorResult<Row, undefined>> {
    return DONE_PROMISE;
  }
}

/**
 * The output parameters (and return status) of a request.
 *
 * The server returns all output parameters of `max` types after all other
 * output parameters.
 */
export class OutputParameters extends ValueSequence {
  declare returnStatus: number | undefined;

  // The names of the output parameters, in the order they were declared.
  declare names: string[];

  // The positions of the parameters read so far, by name.
  declare positions: Map<string, number>;

  constructor(response: Response, returnStatus: number | undefined) {
    super(response, [], false);

    this.returnStatus = returnStatus;
    this.names = response.request.parameters.filter((parameter) => parameter.output).map((parameter) => parameter.name);
    this.positions = new Map();
  }

  nameOf(key: number | string): string {
    if (typeof key === 'number') {
      const name = this.names[key];
      if (name === undefined) {
        throw new Error(`Unknown output parameter \`${key}\`.`);
      }
      return name;
    }

    return key.startsWith('@') ? key.slice(1) : key;
  }

  indexOf(key: number | string): number {
    const name = this.nameOf(key);
    return this.positions.get(name) ?? (this.pending?.name === name ? this.items.length : -1);
  }

  locate(key: number | string): MaybePromise<number> {
    const reader = this.response.reader!;

    while (true) {
      const index = this.indexOf(key);
      if (index >= 0 || this.complete) {
        return index;
      }

      if (this.pending !== undefined) {
        const skipping = this.skipPendingValue();
        if (skipping !== undefined) {
          return skipping.then(() => this.locate(key));
        }
      } else {
        const token = reader.nextSync();
        if (token === undefined) {
          return waitForToken(reader).then(() => this.locate(key));
        }

        this.receive(token);
      }
    }
  }

  addPendingItem(value: unknown) {
    this.positions.set(this.pending!.name, this.items.length);
    super.addPendingItem(value);
  }

  accept(token: Token) {
    if (token instanceof ReturnValueToken) {
      this.positions.set(token.paramName, this.items.length);
      this.items.push({ value: token.value, metadata: token.metadata });
    } else if (token instanceof ReturnValueStartToken) {
      this.pending = { name: token.paramName, metadata: token.metadata, length: token.length };
    } else {
      // The end of the output parameters.
      this.response.reader!.unread(token);
      this.complete = true;
    }
  }

  readAhead(): MaybePromise<void> {
    const readingAhead = super.readAhead();
    if (readingAhead !== undefined) {
      return readingAhead.then(() => this.readAhead());
    }

    if (this.complete) {
      return this.finish();
    }
  }

  /**
   * Read the rest of the response once all output parameters were read,
   * and raise the request's error, if any.
   */
  async finish() {
    const response = this.response;
    const reader = response.reader;

    if (reader !== undefined && !reader.ended && !response.completed) {
      await this.skipRest();
      await reader.drain();
    }

    await response.settled();
  }
}

/**
 * Iterates the rows of a request that returns (at most) one result set.
 */
export class RowIterator implements AsyncIterableIterator<Row> {
  declare response: Response;
  declare resultSet: ResultSet | undefined;
  declare finished: boolean;

  constructor(response: Response) {
    this.response = response;
    this.resultSet = undefined;
    this.finished = false;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  next(): Promise<IteratorResult<Row, undefined>> {
    const resultSet = this.resultSet;
    if (resultSet === undefined || this.finished) {
      return this.nextAsync();
    }

    let result;
    try {
      result = resultSet.nextRow();
    } catch (err) {
      return Promise.reject(err);
    }

    if (result instanceof Promise) {
      return result.then((result): MaybePromise<IteratorResult<Row, undefined>> => {
        return result.done ? this.end() : result;
      });
    }

    return result.done ? this.end() : Promise.resolve(result);
  }

  async nextAsync(): Promise<IteratorResult<Row, undefined>> {
    if (this.finished) {
      return DONE;
    }

    if (this.resultSet === undefined) {
      this.resultSet = await this.response.nextResultSet();

      if (this.resultSet === undefined) {
        return await this.end();
      }
    }

    const result = await this.resultSet.nextRow();
    return result.done ? await this.end() : result;
  }

  async end(): Promise<IteratorReturnResult<undefined>> {
    this.finished = true;

    if (await this.response.nextResultSet() !== undefined) {
      await this.response.abort();
      throw new Error('The request returned more than one result set. Use `results()` to read all of them.');
    }

    return await this.response.end();
  }

  async return(): Promise<IteratorReturnResult<undefined>> {
    this.finished = true;
    await this.response.abort();
    return DONE;
  }
}

/**
 * Iterates the result sets of a request.
 */
export class ResultSetIterator implements AsyncIterableIterator<ResultSet> {
  declare response: Response;
  declare finished: boolean;

  constructor(response: Response) {
    this.response = response;
    this.finished = false;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async next(): Promise<IteratorResult<ResultSet, undefined>> {
    if (this.finished) {
      return DONE;
    }

    const resultSet = await this.response.nextResultSet();
    if (resultSet !== undefined) {
      return { done: false, value: resultSet };
    }

    this.finished = true;
    return await this.response.end();
  }

  async return(): Promise<IteratorReturnResult<undefined>> {
    this.finished = true;
    await this.response.abort();
    return DONE;
  }
}

/**
 * The outcome of a request that was consumed completely via `finish`.
 */
export interface RequestSummary {
  rowCount: number;
  returnStatus: number | undefined;
  outputParameters: { [name: string]: unknown };
}

/**
 * The response to one execution of a request.
 *
 * The response of a request without a completion callback is consumed by
 * pulling: via [[rows]], [[results]] or [[outputParameters]]. It must be
 * finished via [[finish]] before the next request can be made on the
 * connection - most conveniently by declaring it with `await using`:
 *
 * ```js
 * const request = new Request('SELECT id, name FROM users');
 *
 * await using response = connection.execSql(request);
 * for await (const row of response.rows()) {
 *   console.log(row.get('id'), row.get('name'));
 * }
 * ```
 *
 * The response of a request with a completion callback is delivered via the
 * request's events instead.
 */
export class Response {
  declare request: Request;

  // Whether the response is consumed by pulling.
  declare pulled: boolean;

  declare reader: ResponseReader | undefined;
  declare readerPromise: Promise<ResponseReader>;
  declare resolveReader: (reader: ResponseReader) => void;
  declare rejectReader: (error: Error) => void;

  declare completed: boolean;
  declare completionError: Error | undefined;
  declare completion: Promise<void>;
  declare resolveCompletion: () => void;

  // The result set currently being read.
  declare resultSet: ResultSet | undefined;

  // Whether a consumer (`rows()` or `results()`) was used.
  declare consumed: boolean;

  // Whether the request's error was already raised to the consumer (or the
  // consumer canceled the request), so `finish` does not raise it again.
  declare errorDelivered: boolean;

  declare outputParametersPromise: Promise<OutputParameters> | undefined;
  declare finishPromise: Promise<RequestSummary> | undefined;
  declare summary: RequestSummary | undefined;

  // Called once `finish` completed.
  declare onFinished: () => void;

  constructor(request: Request, pulled: boolean) {
    this.request = request;
    this.pulled = pulled;

    this.reader = undefined;
    this.readerPromise = new Promise((resolve, reject) => {
      this.resolveReader = resolve;
      this.rejectReader = reject;
    });
    // A response that fails before it is read must not surface as an
    // unhandled rejection.
    this.readerPromise.catch(() => {});

    this.completed = false;
    this.completionError = undefined;
    this.completion = new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });

    this.resultSet = undefined;
    this.consumed = false;
    this.errorDelivered = false;
    this.outputParametersPromise = undefined;
    this.finishPromise = undefined;
    this.summary = undefined;
    this.onFinished = () => {};
  }

  /**
   * Called by the connection once the response message starts to arrive.
   */
  setReader(reader: ResponseReader) {
    this.reader = reader;
    this.resolveReader(reader);
  }

  /**
   * Called when the request completed, successfully or not.
   */
  complete(error: Error | null | undefined) {
    this.completed = true;
    this.completionError = error ?? undefined;

    if (this.reader === undefined) {
      this.rejectReader(error ?? new RequestError('The request completed without a response.', 'EINVALIDSTATE'));
    } else if (error) {
      this.reader.abort(error);
    }

    this.resolveCompletion();
  }

  getReader(): ResponseReader | Promise<ResponseReader> {
    return this.reader ?? this.readerPromise;
  }

  /**
   * Wait for the request to complete, and throw the request's error, if any.
   */
  async settled(): Promise<void> {
    await this.completion;

    if (this.completionError !== undefined) {
      this.errorDelivered = true;
      throw this.completionError;
    }
  }

  /**
   * Advance to the next result set, skipping the rest of the current one.
   *
   * Returns `undefined` once there are no more result sets - at the end of
   * the response, or at the output parameters.
   */
  async nextResultSet(): Promise<ResultSet | undefined> {
    const reader = await this.getReader();

    const current = this.resultSet;
    if (current !== undefined && !current.done) {
      await current.skipRest();
    }
    this.resultSet = undefined;

    while (true) {
      const token = await reader.next();

      if (token === null) {
        return undefined;
      }

      if (token instanceof ColMetadataToken) {
        return this.resultSet = new ResultSet(this, token.columns);
      }

      if (token instanceof ReturnValueToken || token instanceof ReturnValueStartToken) {
        reader.unread(token);
        return undefined;
      }

      // `DONE` tokens of statements without a result set: the token handler
      // already took care of them.
    }
  }

  /**
   * Called once a consumer read past the last result set.
   */
  async end(): Promise<IteratorReturnResult<undefined>> {
    const reader = await this.getReader();

    if (!reader.ended && !this.completed) {
      // Stopped at the output parameters, which are read via
      // `outputParameters()` or `finish()`.
      if (this.request.error !== undefined) {
        await this.discard();
        await this.settled();
      }

      return DONE;
    }

    await this.settled();
    return DONE;
  }

  /**
   * Read and discard the rest of the response, and wait for the request to
   * complete.
   */
  async discard() {
    const reader = await Promise.resolve(this.getReader()).catch(() => undefined);
    if (reader !== undefined && !reader.ended) {
      await reader.drain();
    }

    await this.completion;
  }

  /**
   * Cancel the request (if it is still running), and wait for it to
   * complete. Used when a consumer stops early.
   */
  async abort() {
    // The consumer does not need to learn about its own cancellation.
    this.errorDelivered = true;

    if (!this.completed) {
      this.request.cancel();
    }

    await this.completion;
  }

  /**
   * Iterate the rows of the response's result set.
   *
   * The loop ending means the request has completed. Errors of the request
   * are thrown by the loop. Stopping the loop early cancels the request.
   *
   * Throws if the request returns more than one result set, use [[results]]
   * for those.
   */
  rows(): RowIterator {
    this.consume();
    return new RowIterator(this);
  }

  /**
   * Iterate the result sets of the response, each of which is an async
   * iterator of its rows.
   */
  results(): ResultSetIterator {
    this.consume();
    return new ResultSetIterator(this);
  }

  /**
   * Read the request's return status and output parameters, skipping any
   * result sets that were not read yet.
   *
   * Output parameters are read one after the other: parameters before the
   * first `max` type parameter can be accessed right away via `get`, the
   * ones after via `stream` or `await read`.
   */
  outputParameters(): Promise<OutputParameters> {
    this.consume();
    return this.readOutputParametersOnce();
  }

  /**
   * Finish the response when it goes out of scope, via `await using`. See
   * [[finish]].
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.pulled) {
      await this.finish();
    }
  }

  consume() {
    if (!this.pulled) {
      throw new Error('The response of a request with a completion callback is delivered via events, and can not be pulled. Create the request without a callback instead.');
    }

    this.consumed = true;
  }

  readOutputParametersOnce(): Promise<OutputParameters> {
    return this.outputParametersPromise ??= this.readOutputParameters();
  }

  async readOutputParameters(): Promise<OutputParameters> {
    while (await this.nextResultSet() !== undefined) {
      // skip the remaining result sets
    }

    const reader = await this.getReader();
    const outputParameters = new OutputParameters(this, reader.returnStatus);

    if (reader.ended || this.completed) {
      outputParameters.complete = true;
      await this.settled();
      return outputParameters;
    }

    await outputParameters.readAhead();
    return outputParameters;
  }

  /**
   * Read the rest of the response, discarding any rows, wait for the request
   * to complete, and return a summary of it.
   *
   * The request's error is raised by `finish` only if the response was not
   * read via [[rows]], [[results]] or [[outputParameters]] - those raise it
   * themselves. `finish` can be called any number of times, and raises an
   * error at most once.
   */
  finish(): Promise<RequestSummary> {
    if (!this.pulled) {
      return Promise.reject(new Error('The response of a request with a completion callback is delivered via events, and can not be pulled.'));
    }

    if (this.finishPromise === undefined) {
      return this.finishPromise = this.readSummary().finally(() => {
        this.onFinished();
      });
    }

    // An error was raised by the first call already.
    return this.finishPromise.catch(() => this.summary!);
  }

  async readSummary(): Promise<RequestSummary> {
    // Consumers that pulled the response (e.g. via a `rows()` loop) received
    // the request's error from there, so it is not raised again.
    const errorDelivered = this.consumed || this.errorDelivered;

    const values: { [name: string]: unknown } = {};
    let returnStatus;

    try {
      const outputParameters = await this.readOutputParametersOnce();
      returnStatus = outputParameters.returnStatus;

      await outputParameters.readRemaining();
      await outputParameters.finish();

      for (const [name, index] of outputParameters.positions) {
        const value = outputParameters.items[index].value;
        if (value !== STREAMED) {
          values[name] = value;
        }
      }
    } catch (err) {
      // Wait for the request to complete even if reading failed, so the
      // connection can be used again once `finish` returned.
      await this.discard();

      this.summary = { rowCount: this.request.rowCount ?? 0, returnStatus: returnStatus, outputParameters: values };

      if (!(errorDelivered && err === this.completionError)) {
        throw err;
      }
    }

    return this.summary = {
      rowCount: this.request.rowCount ?? 0,
      returnStatus: returnStatus,
      outputParameters: values
    };
  }
}

/**
 * A statement prepared on the server via `connection.prepare()`, which can
 * be executed any number of times.
 *
 * The statement must be unprepared once it is no longer needed - most
 * conveniently by declaring it with `await using`:
 *
 * ```js
 * const request = new Request('SELECT name FROM users WHERE id = @id');
 * request.addParameter('id', TYPES.Int);
 *
 * await using statement = await connection.prepare(request);
 * for (const id of ids) {
 *   await using response = statement.execute({ id });
 *   for await (const row of response.rows()) {
 *     // ...
 *   }
 * }
 * ```
 */
export class PreparedStatement {
  declare connection: Connection;
  declare request: PulledRequest;

  // The response of the latest execution.
  declare response: Response | undefined;
  declare unpreparing: Promise<void> | undefined;

  constructor(connection: Connection, request: PulledRequest) {
    this.connection = connection;
    this.request = request;
    this.response = undefined;
    this.unpreparing = undefined;
  }

  /**
   * The statement's handle on the server.
   */
  get handle(): number | undefined {
    return this.request.handle;
  }

  /**
   * Execute the statement with the given parameter values.
   */
  execute(parameters?: { [key: string]: unknown }): Response {
    if (this.unpreparing !== undefined) {
      throw new Error('The statement was unprepared.');
    }

    return this.response = this.connection.execute(this.request, parameters);
  }

  /**
   * Unprepare the statement on the server, finishing its latest execution
   * first if needed. Can be called any number of times.
   */
  unprepare(): Promise<void> {
    return this.unpreparing ??= (async () => {
      const response = this.response;
      if (response !== undefined && response.pulled) {
        await response.finish();
      }

      await this.connection.unprepare(this.request).settled();
    })();
  }

  /**
   * Unprepare the statement when it goes out of scope, via `await using`.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.unprepare();
  }
}
