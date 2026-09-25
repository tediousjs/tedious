import type Debug from './debug';
import type Request from './request';
import type { ExecutionOptions, PulledRequest } from './request';
import type Connection from './connection';
import { RequestError } from './errors';
import { type Metadata } from './metadata-parser';
import { decodePLPValue, isPLPStream } from './value-parser';
import StreamParser, { type ParserOptions } from './token/stream-parser';
import { type ColumnMetadata } from './token/colmetadata-token-parser';
import { type RequestTokenHandler } from './token/handler';
import {
  ColMetadataToken,
  ColumnValueToken,
  DoneInProcToken,
  DoneProcToken,
  DoneToken,
  type ErrorMessageToken,
  type InfoMessageToken,
  ReturnStatusToken,
  ReturnValueStartToken,
  ReturnValueToken,
  RowEndToken,
  RowStartToken,
  RowValuesToken,
  type Token,
  ValueChunkToken,
  ValueEndToken,
  ValueStartToken
} from './token/token';

const DONE: IteratorReturnResult<undefined> = Object.freeze({ done: true, value: undefined });
const DONE_PROMISE = Promise.resolve(DONE);

/**
 * An informational message from the server, e.g. from `PRINT`, `RAISERROR`
 * with a severity of 10 or lower, or a warning.
 */
export interface InfoMessage {
  message: string;
  number: number;
  state: number;
  class: number;
  serverName: string;
  procName: string;
  lineNumber: number;
}

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
  declare handler: RequestTokenHandler;
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

  // Called with each info message, and each error of the request, as they
  // are read.
  declare onInfoMessage: (message: InfoMessage) => void;
  declare onRequestError: (error: RequestError) => void;

  constructor(message: AsyncIterable<Buffer>, handler: RequestTokenHandler, debug: Debug, options: ParserOptions) {
    // Streamed rows are always read as arrays of their values (regardless of
    // `useColumnNames`), and their values are accessed by column index.
    this.parser = new StreamParser(options);
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
    this.onInfoMessage = () => {};
    this.onRequestError = () => {};
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
        case 'onRowValues':
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

        case 'onInfoMessage': {
          const { message, number, state, class: severity, serverName, procName, lineNumber } = token as InfoMessageToken;
          handler.onInfoMessage(token as InfoMessageToken);
          this.onInfoMessage({ message, number, state, class: severity, serverName, procName, lineNumber });
          break;
        }

        case 'onErrorMessage': {
          // The handler records the error (unless the request was canceled).
          const errorCount = handler.errors.length;
          handler.onErrorMessage(token as ErrorMessageToken);
          if (handler.errors.length > errorCount) {
            this.onRequestError(handler.errors[errorCount]);
          }
          break;
        }

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
 * Iterates the data of a streamed value, chunk by chunk.
 */
class ValueIterator implements AsyncIterableIterator<Buffer> {
  declare sequence: ValueSequence;

  // `reading` while the value's data is iterated, `done` once the iteration
  // ended, and `skipped` if the value was skipped before its data was
  // iterated completely.
  declare state: 'reading' | 'done' | 'skipped';

  constructor(sequence: ValueSequence) {
    this.sequence = sequence;
    this.state = 'reading';
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  next(): Promise<IteratorResult<Buffer, undefined>> {
    const rethrow = this.sequence.response.rethrow;

    if (this.state === 'done') {
      return DONE_PROMISE;
    }

    if (this.state === 'skipped') {
      return Promise.reject(new Error('The value was skipped before its data was read completely.')).catch(rethrow);
    }

    try {
      const result = this.read();
      return result instanceof Promise ? result.catch(rethrow) : Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err).catch(rethrow);
    }
  }

  read(): MaybePromise<IteratorResult<Buffer, undefined>> {
    const sequence = this.sequence;
    const reader = sequence.response.reader!;

    const token = reader.nextSync();
    if (token === undefined) {
      return waitForToken(reader).then(() => this.read());
    }

    if (token instanceof ValueChunkToken) {
      return { done: false, value: token.data };
    }

    if (token instanceof ValueEndToken) {
      this.state = 'done';
      sequence.activeIterator = undefined;
      sequence.addPendingValue(STREAMED);

      // Read the values after this one, so they are available via `get`
      // once the iteration ended.
      const readingAhead = sequence.readAhead();
      return readingAhead !== undefined ? readingAhead.then(() => DONE) : DONE;
    }

    return sequence.interrupted().then((error) => {
      throw error;
    });
  }

  /**
   * Stop the iteration. The rest of the value is skipped once the next value
   * (or row) is read.
   */
  return(): Promise<IteratorResult<Buffer, undefined>> {
    if (this.state === 'reading') {
      this.state = 'done';
    }

    return DONE_PROMISE;
  }

  detach() {
    if (this.state === 'reading') {
      this.state = 'skipped';
    }
  }
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

  // The values read so far. A value that was streamed (or skipped) instead
  // of read is `STREAMED`.
  declare items: unknown[];
  declare hasStreamedValues: boolean;
  declare complete: boolean;

  // The streamed value that is up next, once its start has been read.
  declare pending: { name: string, metadata: Metadata, length: number | undefined } | undefined;
  // The data of the pending value read so far, when reading it in full.
  declare pendingChunks: Buffer[];
  declare pendingLength: number;

  // The iterator of the value currently being streamed.
  declare activeIterator: ValueIterator | undefined;

  constructor(response: Response, items: unknown[], complete: boolean) {
    this.response = response;
    this.items = items;
    this.hasStreamedValues = false;
    this.complete = complete;
    this.pending = undefined;
    this.pendingChunks = [];
    this.pendingLength = 0;
    this.activeIterator = undefined;
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

  // The metadata of the value at the given position.
  abstract metadataAt(index: number): Metadata;

  // Apply a token that was read.
  abstract accept(token: Token): void;

  // Called when the pending value was read, streamed or skipped.
  addPendingValue(value: unknown) {
    this.items.push(value);
    this.hasStreamedValues ||= value === STREAMED;
    this.pending = undefined;
  }

  /**
   * The value of an already read value.
   */
  get(key: number | string): unknown {
    const index = this.indexOf(key);

    if (index >= 0 && index < this.items.length) {
      const value = this.items[index];
      if (value !== STREAMED) {
        return value;
      }
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
      const value = this.readValue(key);
      return value instanceof Promise ? value.catch(this.response.rethrow) : Promise.resolve(value);
    } catch (err) {
      return Promise.reject(err).catch(this.response.rethrow);
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
   * values before it: resolves to an async iterable of the data's chunks, or
   * to `null` if the value is `null`.
   *
   * The chunks reference the incoming data without copying it. Stopping the
   * iteration early skips the rest of the value.
   */
  stream(key: number | string): Promise<AsyncIterable<Buffer> | null> {
    try {
      const stream = this.streamValue(key);
      return stream instanceof Promise ? stream.catch(this.response.rethrow) : Promise.resolve(stream);
    } catch (err) {
      return Promise.reject(err).catch(this.response.rethrow);
    }
  }

  streamValue(key: number | string): MaybePromise<ValueIterator | null> {
    const index = this.locate(key);
    if (typeof index !== 'number') {
      return index.then(() => this.streamValue(key));
    }

    if (index < this.items.length) {
      if (!isPLPStream(this.metadataAt(index))) {
        throw new Error(`The value of \`${key}\` is not of a \`max\` type, and can not be streamed. Use \`get()\` instead.`);
      }

      if (this.items[index] === null) {
        return null;
      }

      throw this.unavailable(key, index);
    }

    if (index > this.items.length || this.pending === undefined) {
      throw new Error(`The value of \`${key}\` is not available.`);
    }

    return this.activeIterator = new ValueIterator(this);
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
    // An iteration of the value that was not completed ends here.
    this.activeIterator?.detach();
    this.activeIterator = undefined;

    const reader = this.response.reader!;

    while (true) {
      const token = reader.nextSync();
      if (token === undefined) {
        return waitForToken(reader).then(() => this.skipPendingValue());
      }

      if (token instanceof ValueEndToken) {
        this.addPendingValue(STREAMED);
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
        this.addPendingValue(value);
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
  declare result: Result;

  constructor(result: Result, values: unknown[], complete: boolean) {
    super(result.response, values, complete);
    this.result = result;
  }

  indexOf(key: number | string): number {
    return this.result.indexOf(key);
  }

  metadataAt(index: number): Metadata {
    return this.result.columns[index];
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
      this.items.push(token.value);
    } else if (token instanceof ValueStartToken) {
      this.pending = { name: this.result.columns[token.index].colName, metadata: token.metadata, length: token.length };
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
   *
   * The returned array is the row's own (it is not copied), and stays valid
   * after moving on to the next row.
   */
  values(): unknown[] {
    if (!this.complete || this.pending !== undefined || this.items.length < this.result.columns.length) {
      throw new Error('The row was not read completely. Use `await readValues()` to read all of its values.');
    }

    if (this.hasStreamedValues) {
      const index = this.items.indexOf(STREAMED);
      throw this.unavailable(index, index);
    }

    return this.items;
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
      return reading !== undefined ? reading.then(() => this.values()).catch(this.response.rethrow) : Promise.resolve(this.values());
    } catch (err) {
      return Promise.reject(err).catch(this.response.rethrow);
    }
  }

}

/**
 * A result of a request: a result set, or the row count of a statement
 * without a result set (e.g. of an `INSERT`, `UPDATE` or `DELETE`).
 *
 * A result is an async iterator of its rows - there are none if it has no
 * result set.
 */
export class Result implements AsyncIterableIterator<Row> {
  declare response: Response;

  /**
   * The columns of the result set, or an empty array if the result has no
   * result set.
   */
  declare columns: ColumnMetadata[];

  /**
   * The number of rows returned (for a result set) or affected, once all
   * rows were read. `undefined` if the server did not report it (e.g. with
   * `SET NOCOUNT ON`).
   */
  declare rowCount: number | undefined;

  /**
   * The info messages of the result's statement (and of statements before
   * it that have no result of their own, like `PRINT`). Complete once all
   * rows were read.
   */
  declare messages: InfoMessage[];

  /**
   * The errors of the result's statement. Complete once all rows were read.
   *
   * The errors are raised when the response ends, like all other errors of
   * the request.
   */
  declare errors: RequestError[];

  declare done: boolean;
  declare current: Row | undefined;
  declare columnIndexes: Map<string, number> | undefined;

  constructor(response: Response, columns: ColumnMetadata[]) {
    this.response = response;
    this.columns = columns;
    this.rowCount = undefined;
    this.messages = [];
    this.errors = [];
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
      const result = this.nextRow();
      return result instanceof Promise ? result.catch(this.response.rethrow) : Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err).catch(this.response.rethrow);
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
        case 'onRowValues':
          return { done: false, value: this.current = new Row(this, (token as RowValuesToken).values, true) };

        case 'onRowStart':
          return { done: false, value: this.current = new Row(this, (token as RowStartToken).values, false) };

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
    this.response.endResult(this);
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

  // The metadata of the parameters read so far, by position.
  declare metadata: Metadata[];

  constructor(response: Response, returnStatus: number | undefined) {
    super(response, [], false);

    this.returnStatus = returnStatus;
    this.names = response.request.parameters.filter((parameter) => parameter.output).map((parameter) => parameter.name);
    this.positions = new Map();
    this.metadata = [];
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

  metadataAt(index: number): Metadata {
    return this.metadata[index];
  }

  addPendingValue(value: unknown) {
    this.positions.set(this.pending!.name, this.items.length);
    this.metadata.push(this.pending!.metadata);
    super.addPendingValue(value);
  }

  accept(token: Token) {
    if (token instanceof ReturnValueToken) {
      this.positions.set(token.paramName, this.items.length);
      this.metadata.push(token.metadata);
      this.items.push(token.value);
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
  declare resultSet: Result | undefined;
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
      return this.nextAsync().catch(this.response.rethrow);
    }

    let result;
    try {
      result = resultSet.nextRow();
    } catch (err) {
      return Promise.reject(err).catch(this.response.rethrow);
    }

    if (result instanceof Promise) {
      return result.then((result): MaybePromise<IteratorResult<Row, undefined>> => {
        return result.done ? this.end() : result;
      }).catch(this.response.rethrow);
    }

    return result.done ? this.end().catch(this.response.rethrow) : Promise.resolve(result);
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
      throw new Error('The request returned more than one result set. Use `results()` to read all of them.');
    }

    return await this.response.end();
  }

  /**
   * Called when a loop is stopped early. The rest of the response is read
   * (and discarded) by `finish()`, so it can still be canceled until then,
   * e.g. via the execution's abort signal.
   */
  async return(): Promise<IteratorReturnResult<undefined>> {
    this.finished = true;
    return DONE;
  }
}

/**
 * Iterates the result sets of a request.
 */
export class ResultIterator implements AsyncIterableIterator<Result> {
  declare response: Response;
  declare finished: boolean;

  constructor(response: Response) {
    this.response = response;
    this.finished = false;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  next(): Promise<IteratorResult<Result, undefined>> {
    return this.nextResultSet().catch(this.response.rethrow);
  }

  async nextResultSet(): Promise<IteratorResult<Result, undefined>> {
    if (this.finished) {
      return DONE;
    }

    const result = await this.response.nextResult();
    if (result !== undefined) {
      return { done: false, value: result };
    }

    this.finished = true;
    return await this.response.end();
  }

  /**
   * Called when a loop is stopped early. The rest of the response is read
   * (and discarded) by `finish()`, so it can still be canceled until then,
   * e.g. via the execution's abort signal.
   */
  async return(): Promise<IteratorReturnResult<undefined>> {
    this.finished = true;
    return DONE;
  }
}

/**
 * The outcome of a request that was consumed completely via `finish`.
 */
export interface RequestSummary {
  /**
   * The total number of rows returned or affected.
   */
  rowCount: number;

  returnStatus: number | undefined;

  /**
   * The row count, info messages and errors of each result.
   */
  results: Array<Pick<Result, 'rowCount' | 'messages' | 'errors'>>;

  /**
   * All info messages of the request.
   */
  messages: InfoMessage[];
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

  // The result currently being read.
  declare currentResult: Result | undefined;

  /**
   * The info messages read so far.
   */
  declare messages: InfoMessage[];

  // All results read so far (for the summary).
  declare readResults: Result[];

  // The result whose statement's messages and errors are being read, until
  // its `DONE` token.
  declare collectingResult: Result | undefined;

  // Messages and errors that were read, but belong to the next result.
  declare pendingMessages: InfoMessage[];
  declare pendingErrors: RequestError[];

  // Errors that were raised to the consumer already (e.g. by a `rows()`
  // loop), and are not raised by `finish` again.
  declare deliveredErrors: Set<unknown>;

  // Raise an error to the consumer, remembering that it was raised. Used as
  // the rejection handler of the consumer's calls.
  declare rethrow: (error: unknown) => never;

  declare outputParametersPromise: Promise<OutputParameters> | undefined;
  declare finishPromise: Promise<RequestSummary> | undefined;
  declare summary: RequestSummary | undefined;

  // Called once `finish` completed.
  declare onFinished: () => void;

  // Whether the execution was aborted via its abort signal, and the signal's
  // reason, which replaces the resulting cancellation error.
  declare aborted: boolean;
  declare abortReason: unknown;
  declare removeAbortListener: () => void;

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

    this.currentResult = undefined;
    this.messages = [];
    this.readResults = [];
    this.collectingResult = undefined;
    this.pendingMessages = [];
    this.pendingErrors = [];
    this.deliveredErrors = new Set();
    this.rethrow = (error) => {
      this.deliveredErrors.add(error);
      throw error;
    };
    this.outputParametersPromise = undefined;
    this.finishPromise = undefined;
    this.summary = undefined;
    this.onFinished = () => {};

    this.aborted = false;
    this.abortReason = undefined;
    this.removeAbortListener = () => {};
  }

  /**
   * Cancel the request once the given signal is aborted, unless the request
   * completed already.
   */
  listenForAbort(signal: AbortSignal) {
    if (signal.aborted) {
      this.abort(signal.reason);
      return;
    }

    const onAbort = () => {
      this.abort(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    this.removeAbortListener = () => {
      signal.removeEventListener('abort', onAbort);
    };
  }

  abort(reason: unknown) {
    if (this.completed) {
      return;
    }

    this.aborted = true;
    this.abortReason = reason;
    this.request.cancel();
  }

  /**
   * Called by the connection once the response message starts to arrive.
   */
  setReader(reader: ResponseReader) {
    this.reader = reader;

    reader.onInfoMessage = (message) => {
      this.messages.push(message);
      (this.collectingResult?.messages ?? this.pendingMessages).push(message);
    };

    reader.onRequestError = (error) => {
      (this.collectingResult?.errors ?? this.pendingErrors).push(error);
    };

    this.resolveReader(reader);
  }

  /**
   * Start a result, which gets the messages and errors read since the
   * previous one.
   */
  startResult(result: Result) {
    result.messages = this.pendingMessages;
    result.errors = this.pendingErrors;
    this.pendingMessages = [];
    this.pendingErrors = [];

    this.readResults.push(result);
    this.collectingResult = result.done ? undefined : result;
    return result;
  }

  /**
   * Called once all rows of a result were read.
   */
  endResult(result: Result) {
    if (this.collectingResult === result) {
      this.collectingResult = undefined;
    }
  }

  /**
   * Called when the request completed, successfully or not.
   */
  complete(error: Error | null | undefined) {
    this.completed = true;
    this.removeAbortListener();

    // An aborted request fails with the abort signal's reason, rather than
    // a generic cancellation error.
    if (this.aborted && error instanceof RequestError && error.code === 'ECANCEL') {
      error = this.abortReason as Error;
    }

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
      throw this.completionError;
    }
  }

  /**
   * Advance to the next result set, skipping the rest of the current one.
   *
   * Returns `undefined` once there are no more result sets - at the end of
   * the response, or at the output parameters.
   */
  /**
   * Advance to the next result, skipping the rest of the current one.
   *
   * A result is a result set, or a `DONE` token that reports a row count or
   * an error. Other `DONE` tokens (e.g. of `DECLARE` or `PRINT` statements,
   * or of all statements with `SET NOCOUNT ON`) are skipped.
   */
  async nextResult(): Promise<Result | undefined> {
    const reader = await this.getReader();

    const current = this.currentResult;
    if (current !== undefined && !current.done) {
      await current.skipRest();
    }
    this.currentResult = undefined;

    while (true) {
      const token = await reader.next();

      if (token === null) {
        return undefined;
      }

      if (token instanceof ColMetadataToken) {
        return this.currentResult = this.startResult(new Result(this, token.columns));
      }

      if (token instanceof ReturnValueToken || token instanceof ReturnValueStartToken) {
        reader.unread(token);
        return undefined;
      }

      // A `DONEPROC` token ends a procedure (e.g. `sp_executesql`) rather
      // than a statement.
      if ((token instanceof DoneToken || token instanceof DoneInProcToken) && !token.attention && (token.rowCount !== undefined || token.sqlError)) {
        const result = new Result(this, []);
        result.rowCount = token.rowCount;
        result.done = true;
        return this.currentResult = this.startResult(result);
      }
    }
  }

  /**
   * Advance to the next result that has a result set.
   */
  async nextResultSet(): Promise<Result | undefined> {
    while (true) {
      const result = await this.nextResult();
      if (result === undefined || result.columns.length > 0) {
        return result;
      }
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
   * Iterate the rows of the response's result set.
   *
   * The loop ending means the request has completed. Errors of the request
   * are thrown by the loop. Stopping the loop early skips the remaining rows,
   * and leaves any error of the request to be raised by `finish`.
   *
   * Results without a result set (e.g. the row count of an `INSERT` before
   * a `SELECT`) are skipped. Throws if the request returns more than one
   * result set, use [[results]] for those.
   */
  rows(): RowIterator {
    this.assertPulled();
    return new RowIterator(this);
  }

  /**
   * Iterate the results of the response, in order: one for each result set,
   * and one for each statement without a result set that reports a row count
   * (e.g. an `INSERT`, `UPDATE` or `DELETE`, unless `SET NOCOUNT ON` is in
   * effect) or an error. Each result is an async iterator of its rows.
   *
   * Each result has the info messages and errors of its statement. All info
   * messages are also available via [[messages]].
   */
  results(): ResultIterator {
    this.assertPulled();
    return new ResultIterator(this);
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
    this.assertPulled();
    return this.readOutputParametersOnce().catch(this.rethrow);
  }

  /**
   * Finish the response when it goes out of scope, via `await using`. See
   * [[finish]] - except that the reason of an aborted execution is not
   * raised again.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.pulled) {
      return;
    }

    try {
      await this.finish();
    } catch (err) {
      // Whoever aborted the request knows about it already - and commonly
      // aborted it because of an error that is leaving the scope right now.
      if (!(this.aborted && err === this.abortReason)) {
        throw err;
      }
    }
  }

  assertPulled() {
    if (!this.pulled) {
      throw new Error('The response of a request with a completion callback is delivered via events, and can not be pulled. Create the request without a callback instead.');
    }
  }


  readOutputParametersOnce(): Promise<OutputParameters> {
    return this.outputParametersPromise ??= this.readOutputParameters();
  }

  async readOutputParameters(): Promise<OutputParameters> {
    while (await this.nextResult() !== undefined) {
      // skip the remaining results
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
   * Read the rest of the response, discarding any rows and output
   * parameters (use [[outputParameters]] to read those), wait for the
   * request to complete, and return a summary of it: the row count, info
   * messages and errors of each result.
   *
   * Raises the request's error, unless it was raised already (e.g. by a
   * `rows()` loop).
   * `finish` can be called any number of times, and raises an error at most
   * once.
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
    try {
      while (await this.nextResult() !== undefined) {
        // read the remaining results
      }

      // Output parameters nobody asked for are discarded.
      await this.discard();
      await this.settled();
    } catch (err) {
      // Wait for the request to complete even if reading failed, so the
      // connection can be used again once `finish` returned.
      await this.discard();

      this.summary = this.makeSummary();

      // Errors the consumer received already are not raised again.
      if (!this.deliveredErrors.has(err)) {
        throw err;
      }
    }

    return this.summary = this.makeSummary();
  }

  makeSummary(): RequestSummary {
    return {
      rowCount: this.request.rowCount ?? 0,
      returnStatus: this.reader?.returnStatus,
      results: this.readResults,
      messages: this.messages
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
  execute(parameters?: { [key: string]: unknown }, options?: ExecutionOptions): Response {
    if (this.unpreparing !== undefined) {
      throw new Error('The statement was unprepared.');
    }

    return this.response = this.connection.execute(this.request, parameters, options);
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
