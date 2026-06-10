import { EventEmitter } from 'events';
import { type Parameter, type DataType } from './data-type';
import { RequestError } from './errors';

import Connection from './connection';
import { SequentialRow } from './sequential-row';
import { buildRow } from './token/row-format';
import { type ParserOptions } from './token/stream-parser';
import { type Metadata } from './metadata-parser';
import { SQLServerStatementColumnEncryptionSetting } from './always-encrypted/types';
import { type ColumnMetadata } from './token/colmetadata-token-parser';
import { Collation } from './collation';

/**
 * The callback is called when the request has completed, either successfully or with an error.
 * If an error occurs during execution of the statement(s), then `err` will describe the error.
 *
 * As only one request at a time may be executed on a connection, another request should not
 * be initiated until this callback is called.
 *
 * This callback is called before `requestCompleted` is emitted.
 */
type CompletionCallback =
  /**
   * @param error
   *   If an error occurred, an error object.
   *
   * @param rowCount
   *   The number of rows emitted as result of executing the SQL statement.
   *
   * @param rows
   *   Rows as a result of executing the SQL statement.
   *   Will only be available if [[ConnectionOptions.rowCollectionOnRequestCompletion]] is `true`.
   */
  // TODO: Figure out how to type the `rows` parameter here.
  (error: Error | null | undefined, rowCount?: number, rows?: any) => void;

export interface ParameterOptions {
  output?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
}

interface RequestOptions {
  statementColumnEncryptionSetting?: SQLServerStatementColumnEncryptionSetting;
}

/**
 * A single result set of a request, exposing the result set's column
 * metadata and an async iterable over its rows.
 *
 * Only consumable while it is the current result set - see
 * [[Request.resultSets]] for the liveness rules.
 */
class ResultSet {
  /**
   * The result set's column metadata.
   */
  declare readonly columns: ColumnMetadata[];

  declare private request: Request;
  declare private queue: unknown[][];
  declare private currentBatch: unknown[];
  declare private flushScheduled: boolean;
  declare private ended: boolean;
  declare private discarded: boolean;
  declare private pausedByThis: boolean;
  declare private wakeup: (() => void) | undefined;

  /**
   * @private
   */
  constructor(request: Request, columns: ColumnMetadata[]) {
    this.request = request;
    this.columns = columns;

    this.queue = [];
    this.currentBatch = [];
    this.flushScheduled = false;
    this.ended = false;
    this.discarded = false;
    this.pausedByThis = false;
    this.wakeup = undefined;
  }

  /**
   * @private
   */
  push(row: unknown) {
    if (this.discarded) {
      return;
    }

    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => {
        this.flush();
      });
    }

    this.currentBatch.push(row);
  }

  /**
   * @private
   */
  end() {
    this.ended = true;
    this.flush();
  }

  /**
   * Stops delivering rows for this result set - any buffered and future
   * rows are dropped.
   *
   * @private
   */
  discard() {
    this.discarded = true;
    this.queue = [];
    this.currentBatch = [];

    if (this.pausedByThis) {
      this.pausedByThis = false;
      this.request.resume();
    }

    this.wake();
  }

  private flush() {
    this.flushScheduled = false;

    if (this.currentBatch.length > 0 && !this.discarded) {
      this.queue.push(this.currentBatch);
      this.currentBatch = [];

      if (this.queue.length > 1 && !this.pausedByThis) {
        this.pausedByThis = true;
        this.request.pause();
      }
    }

    this.wake();
  }

  private wake() {
    const resolve = this.wakeup;
    if (resolve !== undefined) {
      this.wakeup = undefined;
      resolve();
    }
  }

  /**
   * Returns an async iterable over the result set's rows, yielding batches
   * (arrays) of rows - one per parsing burst, like [[Request.batches]].
   */
  batches<T extends unknown[] = unknown[]>(): AsyncIterableIterator<T[]> {
    const iterator: AsyncIterableIterator<T[]> = {
      [Symbol.asyncIterator]() {
        return iterator;
      },

      next: async (): Promise<IteratorResult<T[], undefined>> => {
        while (true) {
          if (this.queue.length > 0) {
            const batch = this.queue.shift()!;

            if (this.pausedByThis && this.queue.length <= 1) {
              this.pausedByThis = false;
              this.request.resume();
            }

            return { value: batch as T[], done: false };
          }

          if (this.ended || this.discarded) {
            return { value: undefined, done: true };
          }

          await new Promise<void>((resolve) => {
            this.wakeup = resolve;
          });
        }
      },

      return: async (): Promise<IteratorResult<T[], undefined>> => {
        this.discard();
        return { value: undefined, done: true };
      }
    };

    return iterator;
  }

  /**
   * Returns an async iterable over the result set's rows, as arrays of
   * values, positionally aligned with [[columns]].
   */
  rows<T extends unknown[] = unknown[]>(): AsyncIterableIterator<T> {
    const batches = this.batches<T>();

    return (async function*() {
      for await (const batch of batches) {
        yield* batch;
      }
    })();
  }

  /**
   * Returns an async iterable over the result set's rows, as objects
   * mapping column names to values. For duplicated column names, the first
   * column wins.
   */
  rowsAsObjects<T extends Record<string, unknown> = Record<string, unknown>>(): AsyncIterableIterator<T> {
    const batches = this.batches();
    const columns = this.columns;

    return (async function*() {
      for await (const batch of batches) {
        for (const values of batch) {
          yield buildRow(columns, values, OBJECT_ROW_OPTIONS) as T;
        }
      }
    })();
  }
}

const OBJECT_ROW_OPTIONS = { rowFormat: 'values', useColumnNames: true } as ParserOptions;

/**
 * ```js
 * const { Request } = require('tedious');
 * const request = new Request("select 42, 'hello world'", (err, rowCount) {
 *   // Request completion callback...
 * });
 * connection.execSql(request);
 * ```
 */
class Request extends EventEmitter {
  /**
   * @private
   */
  declare sqlTextOrProcedure: string | undefined;
  /**
   * @private
   */
  declare parameters: Parameter[];
  /**
   * @private
   */
  declare parametersByName: { [key: string]: Parameter };
  /**
   * @private
   */
  declare preparing: boolean;
  /**
   * @private
   */
  declare canceled: boolean;
  /**
   * @private
   */
  declare paused: boolean;

  /**
   * @private
   */
  declare sequentialRowMode: boolean;
  /**
   * Set when one of the iteration APIs is used - rows are then parsed as
   * plain value arrays, independent of the connection's `rowFormat` and
   * `useColumnNames` options.
   *
   * @private
   */
  declare iterationRowMode: boolean;
  /**
   * The column metadata of the result set currently being received.
   *
   * @private
   */
  declare currentColumns: ColumnMetadata[] | undefined;
  /**
   * @private
   */
  declare userCallback: CompletionCallback;
  /**
   * @private
   */
  declare handle: number | undefined;
  /**
   * @private
   */
  declare error: Error | undefined;
  /**
   * @private
   */
  declare connection: Connection | undefined;
  /**
   * @private
   */
  declare timeout: number | undefined;

  /**
   * @private
   */
  declare collectedRows?: Array<any>;
  /**
   * @private
   */
  declare rst?: Array<any>;
  /**
   * @private
   */
  declare rowCount?: number;

  /**
   * @private
   */
  declare callback: CompletionCallback;


  declare shouldHonorAE?: boolean;
  declare statementColumnEncryptionSetting: SQLServerStatementColumnEncryptionSetting;
  declare cryptoMetadataLoaded: boolean;

  /**
   * This event, describing result set columns, will be emitted before row
   * events are emitted. This event may be emitted multiple times when more
   * than one recordset is produced by the statement.
   *
   * An array like object, where the columns can be accessed either by index
   * or name. Columns with a name that is an integer are not accessible by name,
   * as it would be interpreted as an array index.
   */
  on(
    event: 'columnMetadata',
    listener:
    (columns: ColumnMetadata[] | { [key: string]: ColumnMetadata }) => void
  ): this

  /**
   * The request has been prepared and can be used in subsequent calls to execute and unprepare.
   */
  on(event: 'prepared', listener: () => void): this

  /**
   * The request encountered an error and has not been prepared.
   */
  on(event: 'error', listener: (err: Error) => void): this

  /**
   * A row resulting from execution of the SQL statement.
   */
  on(
    event: 'row',
    listener:
      /**
       * An array or object (depends on [[ConnectionOptions.useColumnNames]]), where the columns can be accessed by index/name.
       * Each column has two properties, `metadata` and `value`：
       *
       * * `metadata`
       *
       *    The same data that is exposed in the `columnMetadata` event.
       *
       * * `value`
       *
       *    The column's value. It will be `null` for a `NULL`.
       *    If there are multiple columns with the same name, then this will be an array of the values.
       */
      (columns: any) => void
  ): this

  /**
   * All rows from a result set have been provided (through `row` events).
   *
   * This token is used to indicate the completion of a SQL statement.
   * As multiple SQL statements can be sent to the server in a single SQL batch, multiple `done` can be generated.
   * An `done` event is emitted for each SQL statement in the SQL batch except variable declarations.
   * For execution of SQL statements within stored procedures, `doneProc` and `doneInProc` events are used in place of `done`.
   *
   * If you are using [[Connection.execSql]] then SQL server may treat the multiple calls with the same query as a stored procedure.
   * When this occurs, the `doneProc` and `doneInProc` events may be emitted instead. You must handle both events to ensure complete coverage.
   */
  on(
    event: 'done',
    listener:
      /**
       * @param rowCount
       *   The number of result rows. May be `undefined` if not available.
       *
       * @param more
       *   If there are more results to come (probably because multiple statements are being executed), then `true`.
       *
       * @param rst
       *   Rows as a result of executing the SQL statement.
       *   Will only be available if Connection's [[ConnectionOptions.rowCollectionOnDone]] is `true`.
       */
      (rowCount: number | undefined, more: boolean, rst?: any[]) => void
  ): this

  /**
   * `request.on('doneInProc', function (rowCount, more, rows) { });`
   *
   * Indicates the completion status of a SQL statement within a stored procedure. All rows from a statement
   * in a stored procedure have been provided (through `row` events).
   *
   * This event may also occur when executing multiple calls with the same query using [[execSql]].
   */
  on(
    event: 'doneInProc',
    listener:
      /**
       * @param rowCount
       *   The number of result rows. May be `undefined` if not available.
       *
       * @param more
       *   If there are more results to come (probably because multiple statements are being executed), then `true`.
       *
       * @param rst
       *   Rows as a result of executing the SQL statement.
       *   Will only be available if Connection's [[ConnectionOptions.rowCollectionOnDone]] is `true`.
       */
      (rowCount: number | undefined, more: boolean, rst?: any[]) => void
  ): this

  /**
   * Indicates the completion status of a stored procedure. This is also generated for stored procedures
   * executed through SQL statements.\
   * This event may also occur when executing multiple calls with the same query using [[execSql]].
   */
  on(
    event: 'doneProc',
    listener:
      /**
       * @param rowCount
       *   The number of result rows. May be `undefined` if not available.
       *
       * @param more
       *   If there are more results to come (probably because multiple statements are being executed), then `true`.
       *
       * @param rst
       *   Rows as a result of executing the SQL statement.
       *   Will only be available if Connection's [[ConnectionOptions.rowCollectionOnDone]] is `true`.
       */
      (rowCount: number | undefined, more: boolean, procReturnStatusValue: number, rst?: any[]) => void
  ): this

  /**
   * A value for an output parameter (that was added to the request with [[addOutputParameter]]).
   * See also `Using Parameters`.
   */
  on(
    event: 'returnValue',
    listener:
      /**
       * @param parameterName
       *   The parameter name. (Does not start with '@'.)
       *
       * @param value
       *   The parameter's output value.
       *
       * @param metadata
       *   The same data that is exposed in the `columnMetaData` event.
       */
      (parameterName: string, value: unknown, metadata: Metadata) => void
  ): this

  /**
   * This event gives the columns by which data is ordered, if `ORDER BY` clause is executed in SQL Server.
   */
  on(
    event: 'order',
    listener:
      /**
       * @param orderColumns
       *   An array of column numbers in the result set by which data is ordered.
       */
      (orderColumns: number[]) => void
  ): this

  on(event: 'requestCompleted', listener: () => void): this

  on(event: 'cancel', listener: () => void): this

  on(event: 'pause', listener: () => void): this

  on(event: 'resume', listener: () => void): this

  on(event: string | symbol, listener: (...args: any[]) => void) {
    return super.on(event, listener);
  }

  /**
   * @private
   */
  emit(event: 'columnMetadata', columns: ColumnMetadata[] | { [key: string]: ColumnMetadata }): boolean
  /**
   * @private
   */
  emit(event: 'prepared'): boolean
  /**
   * @private
   */
  emit(event: 'error', err: Error): boolean
  /**
   * @private
   */
  emit(event: 'row', columns: any): boolean
  /**
   * @private
   */
  emit(event: 'done', rowCount: number | undefined, more: boolean, rst?: any[]): boolean
  /**
   * @private
   */
  emit(event: 'doneInProc', rowCount: number | undefined, more: boolean, rst?: any[]): boolean
  /**
   * @private
   */
  emit(event: 'doneProc', rowCount: number | undefined, more: boolean, procReturnStatusValue: number, rst?: any[]): boolean
  /**
   * @private
   */
  emit(event: 'returnValue', parameterName: string, value: unknown, metadata: Metadata): boolean
  /**
   * @private
   */
  emit(event: 'requestCompleted'): boolean
  /**
   * @private
   */
  emit(event: 'cancel'): boolean
  /**
   * @private
   */
  emit(event: 'pause'): boolean
  /**
   * @private
   */
  emit(event: 'resume'): boolean
  /**
   * @private
   */
  emit(event: 'order', orderColumns: number[]): boolean
  emit(event: string | symbol, ...args: any[]) {
    return super.emit(event, ...args);
  }

  /**
   * @param sqlTextOrProcedure
   *   The SQL statement to be executed
   *
   * @param callback
   *   The callback to execute once the request has been fully completed.
   */
  constructor(sqlTextOrProcedure: string | undefined, callback: CompletionCallback, options?: RequestOptions) {
    super();

    this.sqlTextOrProcedure = sqlTextOrProcedure;
    this.parameters = [];
    this.parametersByName = {};
    this.preparing = false;
    this.handle = undefined;
    this.canceled = false;
    this.paused = false;
    this.sequentialRowMode = false;
    this.iterationRowMode = false;
    this.currentColumns = undefined;
    this.error = undefined;
    this.connection = undefined;
    this.timeout = undefined;
    this.userCallback = callback;
    this.statementColumnEncryptionSetting = (options && options.statementColumnEncryptionSetting) || SQLServerStatementColumnEncryptionSetting.UseConnectionSetting;
    this.cryptoMetadataLoaded = false;
    this.callback = function(err: Error | undefined | null, rowCount?: number, rows?: any) {
      if (this.preparing) {
        this.preparing = false;
        if (err) {
          this.emit('error', err);
        } else {
          this.emit('prepared');
        }
      } else {
        this.userCallback(err, rowCount, rows);
        this.emit('requestCompleted');
      }
    };
  }

  /**
   * @param name
   *   The parameter name. This should correspond to a parameter in the SQL,
   *   or a parameter that a called procedure expects. The name should not start with `@`.
   *
   * @param type
   *   One of the supported data types.
   *
   * @param value
   *   The value that the parameter is to be given. The Javascript type of the
   *   argument should match that documented for data types.
   *
   * @param options
   *   Additional type options. Optional.
   */
  // TODO: `type` must be a valid TDS value type
  addParameter(name: string, type: DataType, value?: unknown, options?: Readonly<ParameterOptions> | null) {
    const { output = false, length, precision, scale } = options ?? {};

    const parameter: Parameter = {
      type: type,
      name: name,
      value: value,
      output: output,
      length: length,
      precision: precision,
      scale: scale
    };

    this.parameters.push(parameter);
    this.parametersByName[name] = parameter;
  }

  /**
   * @param name
   *   The parameter name. This should correspond to a parameter in the SQL,
   *   or a parameter that a called procedure expects.
   *
   * @param type
   *   One of the supported data types.
   *
   * @param value
   *   The value that the parameter is to be given. The Javascript type of the
   *   argument should match that documented for data types
   *
   * @param options
   *   Additional type options. Optional.
   */
  addOutputParameter(name: string, type: DataType, value?: unknown, options?: Readonly<ParameterOptions> | null) {
    this.addParameter(name, type, value, { ...options, output: true });
  }

  /**
   * @private
   */
  makeParamsParameter(parameters: Parameter[]) {
    let paramsParameter = '';
    for (let i = 0, len = parameters.length; i < len; i++) {
      const parameter = parameters[i];
      if (paramsParameter.length > 0) {
        paramsParameter += ', ';
      }
      paramsParameter += '@' + parameter.name + ' ';
      paramsParameter += parameter.type.declaration(parameter);
      if (parameter.output) {
        paramsParameter += ' OUTPUT';
      }
    }
    return paramsParameter;
  }

  /**
   * @private
   */
  validateParameters(collation: Collation | undefined) {
    for (let i = 0, len = this.parameters.length; i < len; i++) {
      const parameter = this.parameters[i];

      try {
        parameter.value = parameter.type.validate(parameter.value, collation);
      } catch (error: any) {
        throw new RequestError('Validation failed for parameter \'' + parameter.name + '\'. ' + error.message, 'EPARAM', { cause: error });
      }
    }
  }

  /**
   * Temporarily suspends the flow of data from the database. No more `row` events will be emitted until [[resume] is called.
   * If this request is already in a paused state, calling [[pause]] has no effect.
   */
  pause() {
    if (this.paused) {
      return;
    }
    this.emit('pause');
    this.paused = true;
  }

  /**
   * Resumes the flow of data from the database.
   * If this request is not in a paused state, calling [[resume]] has no effect.
   */
  resume() {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.emit('resume');
  }

  /**
   * @private
   */
  private enableIterationRowMode() {
    if (this.sequentialRowMode) {
      throw new Error('`sequentialRows` cannot be combined with the other iteration APIs');
    }

    this.iterationRowMode = true;
  }

  /**
   * Returns an async iterable over the rows of this request, yielding
   * batches (arrays) of rows.
   *
   * Rows are batched per parsing burst - all rows that are parsed from the
   * currently buffered data are delivered as a single batch, so iterating
   * does not pay a promise per row. The request is paused when batches are
   * produced faster than they are consumed, and resumed once the consumer
   * catches up.
   *
   * Rows are always plain value arrays, independent of the connection's
   * `rowFormat` and `useColumnNames` options. Batches never span result set
   * boundaries.
   *
   * Must be called before the request is executed, otherwise rows may be
   * missed or arrive in the wrong shape. When the request fails, the error
   * is also thrown to the consumer of the iterable.
   */
  batches<T extends unknown[] = unknown[]>(): AsyncIterableIterator<T[]> {
    this.enableIterationRowMode();

    const queue: unknown[][] = [];
    let currentBatch: unknown[] = [];
    let flushScheduled = false;
    let finished = false;
    let pausedByIterator = false;
    let wakeup: (() => void) | undefined;

    const wake = () => {
      const resolve = wakeup;
      if (resolve !== undefined) {
        wakeup = undefined;
        resolve();
      }
    };

    const flush = () => {
      flushScheduled = false;

      if (currentBatch.length > 0) {
        queue.push(currentBatch);
        currentBatch = [];

        if (queue.length > 1 && !pausedByIterator) {
          pausedByIterator = true;
          this.pause();
        }
      }

      wake();
    };

    const onRow = (row: unknown) => {
      // Rows arriving in the same parsing burst are dispatched synchronously,
      // so flushing on the next microtask batches them up.
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }

      currentBatch.push(row);
    };

    // A new result set forces a batch boundary.
    const onColumnMetadata = flush;

    const onCompleted = () => {
      this.removeListener('row', onRow);
      this.removeListener('columnMetadata', onColumnMetadata);

      finished = true;
      flush();
    };

    this.on('row', onRow);
    this.on('columnMetadata', onColumnMetadata);
    this.once('requestCompleted', onCompleted);

    return {
      [Symbol.asyncIterator]() {
        return this;
      },

      next: async (): Promise<IteratorResult<T[], undefined>> => {
        while (true) {
          if (queue.length > 0) {
            const batch = queue.shift()!;

            if (pausedByIterator && queue.length <= 1) {
              pausedByIterator = false;
              this.resume();
            }

            return { value: batch as T[], done: false };
          }

          if (finished) {
            if (this.error) {
              throw this.error;
            }

            return { value: undefined, done: true };
          }

          await new Promise<void>((resolve) => {
            wakeup = resolve;
          });
        }
      },

      return: async (): Promise<IteratorResult<T[], undefined>> => {
        // Abandoning the iteration cancels the request.
        this.removeListener('row', onRow);
        this.removeListener('columnMetadata', onColumnMetadata);

        if (pausedByIterator) {
          pausedByIterator = false;
          this.resume();
        }

        if (!finished) {
          this.cancel();
        }

        return { value: undefined, done: true };
      }
    };
  }

  /**
   * Returns an async iterable over the rows of this request, across all of
   * its result sets.
   *
   * Rows are always plain value arrays, positionally aligned with the
   * `columnMetadata` event's columns, independent of the connection's
   * `rowFormat` and `useColumnNames` options. Use [[rowsAsObjects]] for
   * rows keyed by column name.
   *
   * A thin convenience layer over [[batches]] - rows are still gathered in
   * batches internally, only the iteration is per row. Use [[resultSets]]
   * when the result set structure matters, and [[batches]] for the lowest
   * iteration overhead.
   *
   * Must be called before the request is executed. Breaking out of the
   * iteration cancels the request. When the request fails, the error is
   * also thrown to the consumer.
   */
  rows<T extends unknown[] = unknown[]>(): AsyncIterableIterator<T> {
    // Subscribe eagerly - a generator would only start listening for rows
    // once the iteration starts.
    const batches = this.batches<T>();

    return (async function*() {
      for await (const batch of batches) {
        yield* batch;
      }
    })();
  }

  /**
   * Returns an async iterable over the rows of this request, across all of
   * its result sets, as objects mapping column names to values. For
   * duplicated column names, the first column wins.
   *
   * Must be called before the request is executed. Breaking out of the
   * iteration cancels the request. When the request fails, the error is
   * also thrown to the consumer.
   */
  rowsAsObjects<T extends Record<string, unknown> = Record<string, unknown>>(): AsyncIterableIterator<T> {
    // Built on the result set iteration, since the name keying needs each
    // result set's columns.
    const resultSets = this.resultSets();

    return (async function*() {
      for await (const resultSet of resultSets) {
        yield* resultSet.rowsAsObjects<T>();
      }
    })();
  }

  /**
   * Returns an async iterable over the result sets of this request, in the
   * order they arrive. Each result set exposes its column metadata and an
   * async iterable over its rows.
   *
   * Result sets arrive strictly in order: a result set's rows can only be
   * consumed while it is the current one. Advancing this iterator discards
   * any unconsumed rows of the previous result set; abandoning a result
   * set's row iterator discards its remaining rows without cancelling the
   * request; abandoning this iterator cancels the request.
   *
   * Must be called before the request is executed. When the request fails,
   * the error is also thrown to the consumer.
   */
  resultSets(): AsyncIterableIterator<ResultSet> {
    this.enableIterationRowMode();

    const pending: ResultSet[] = [];
    let currentSet: ResultSet | undefined;
    let activeSet: ResultSet | undefined;
    let finished = false;
    let wakeup: (() => void) | undefined;

    const wake = () => {
      const resolve = wakeup;
      if (resolve !== undefined) {
        wakeup = undefined;
        resolve();
      }
    };

    const onColumnMetadata = (columns: unknown) => {
      if (currentSet !== undefined) {
        currentSet.end();
      }

      // `currentColumns` always holds the plain columns array, while the
      // event payload's shape varies with `useColumnNames`.
      currentSet = new ResultSet(this, this.currentColumns ?? columns as ColumnMetadata[]);
      pending.push(currentSet);
      wake();
    };

    const onRow = (row: unknown) => {
      currentSet!.push(row);
    };

    const onCompleted = () => {
      this.removeListener('columnMetadata', onColumnMetadata);
      this.removeListener('row', onRow);

      if (currentSet !== undefined) {
        currentSet.end();
      }

      finished = true;
      wake();
    };

    this.on('columnMetadata', onColumnMetadata);
    this.on('row', onRow);
    this.once('requestCompleted', onCompleted);

    return {
      [Symbol.asyncIterator]() {
        return this;
      },

      next: async (): Promise<IteratorResult<ResultSet, undefined>> => {
        // Advancing discards whatever is left of the previous result set.
        if (activeSet !== undefined) {
          activeSet.discard();
          activeSet = undefined;
        }

        while (true) {
          if (pending.length > 0) {
            activeSet = pending.shift()!;
            return { value: activeSet, done: false };
          }

          if (finished) {
            if (this.error) {
              throw this.error;
            }

            return { value: undefined, done: true };
          }

          await new Promise<void>((resolve) => {
            wakeup = resolve;
          });
        }
      },

      return: async (): Promise<IteratorResult<ResultSet, undefined>> => {
        if (activeSet !== undefined) {
          activeSet.discard();
          activeSet = undefined;
        }

        this.removeListener('columnMetadata', onColumnMetadata);
        this.removeListener('row', onRow);

        if (!finished) {
          this.cancel();
        }

        return { value: undefined, done: true };
      }
    };
  }

  /**
   * Returns an async iterable over the rows of this request, consumed
   * sequentially - large (`(max)` typed, xml and UDT) values can be read as
   * streams of chunks through the [[SequentialRow]] handles instead of
   * being materialized.
   *
   * In this mode, the parser and the consumer run in lockstep with a single
   * in-flight row: the next row is only parsed once the current one was
   * consumed (advancing the iteration drains whatever was left of the
   * current row). The `rowFormat` and row collection options do not apply.
   *
   * Must be called before the request is executed. Breaking out of the
   * iteration cancels the request. When the request fails, the error is
   * also thrown to the consumer.
   */
  sequentialRows(): AsyncIterableIterator<SequentialRow> {
    if (this.iterationRowMode) {
      throw new Error('`sequentialRows` cannot be combined with the other iteration APIs');
    }

    this.sequentialRowMode = true;

    let pendingRow: SequentialRow | undefined;
    let currentRow: SequentialRow | undefined;
    let finished = false;
    let wakeup: (() => void) | undefined;

    const wake = () => {
      const resolve = wakeup;
      if (resolve !== undefined) {
        wakeup = undefined;
        resolve();
      }
    };

    const onRow = (row: unknown) => {
      pendingRow = row as SequentialRow;
      wake();
    };

    const onCompleted = () => {
      this.removeListener('row', onRow);

      finished = true;
      wake();
    };

    this.on('row', onRow);
    this.once('requestCompleted', onCompleted);

    return {
      [Symbol.asyncIterator]() {
        return this;
      },

      next: async (): Promise<IteratorResult<SequentialRow, undefined>> => {
        // Let the parser continue past the current row.
        if (currentRow !== undefined) {
          const row = currentRow;
          currentRow = undefined;
          await row.finish();
        }

        while (true) {
          if (pendingRow !== undefined) {
            currentRow = pendingRow;
            pendingRow = undefined;
            return { value: currentRow, done: false };
          }

          if (finished) {
            if (this.error) {
              throw this.error;
            }

            return { value: undefined, done: true };
          }

          await new Promise<void>((resolve) => {
            wakeup = resolve;
          });
        }
      },

      return: async (): Promise<IteratorResult<SequentialRow, undefined>> => {
        if (currentRow !== undefined) {
          const row = currentRow;
          currentRow = undefined;
          await row.finish();
        }

        if (pendingRow !== undefined) {
          const row = pendingRow;
          pendingRow = undefined;
          await row.finish();
        }

        this.removeListener('row', onRow);

        if (!finished) {
          this.cancel();
        }

        return { value: undefined, done: true };
      }
    };
  }

  /**
   * Cancels a request while waiting for a server response.
   */
  cancel() {
    if (this.canceled) {
      return;
    }

    this.canceled = true;
    this.emit('cancel');
  }

  /**
   * Sets a timeout for this request.
   *
   * @param timeout
   *   The number of milliseconds before the request is considered failed,
   *   or `0` for no timeout. When no timeout is set for the request,
   *   the [[ConnectionOptions.requestTimeout]] of the [[Connection]] is used.
   */
  setTimeout(timeout?: number) {
    this.timeout = timeout;
  }
}

export default Request;
export { ResultSet };
module.exports = Request;
