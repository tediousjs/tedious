import { EventEmitter } from 'events';
import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import Connection, { type InternalConnectionOptions } from './connection';

import { TYPE as TOKEN_TYPE } from './token/token';

import { type DataType, type Parameter } from './data-type';
import { Collation } from './collation';

/**
 * @private
 */
const FLAGS = {
  nullable: 1 << 0,
  caseSen: 1 << 1,
  updateableReadWrite: 1 << 2,
  updateableUnknown: 1 << 3,
  identity: 1 << 4,
  computed: 1 << 5, // introduced in TDS 7.2
  fixedLenCLRType: 1 << 8, // introduced in TDS 7.2
  sparseColumnSet: 1 << 10, // introduced in TDS 7.3.B
  hidden: 1 << 13, // introduced in TDS 7.2
  key: 1 << 14, // introduced in TDS 7.2
  nullableUnknown: 1 << 15 // introduced in TDS 7.2
};

/**
 * @private
 */
const DONE_STATUS = {
  FINAL: 0x00,
  MORE: 0x1,
  ERROR: 0x2,
  INXACT: 0x4,
  COUNT: 0x10,
  ATTN: 0x20,
  SRVERROR: 0x100
};

/**
 * @private
 */
interface InternalOptions {
  checkConstraints: boolean;
  fireTriggers: boolean;
  keepNulls: boolean;
  lockTable: boolean;
  order: { [columnName: string]: 'ASC' | 'DESC' };
}

export interface Options {
  /**
   * Honors constraints during bulk load, using T-SQL
   * [CHECK_CONSTRAINTS](https://technet.microsoft.com/en-us/library/ms186247(v=sql.105).aspx).
   * (default: `false`)
   */
  checkConstraints?: InternalOptions['checkConstraints'] | undefined;

  /**
   * Honors insert triggers during bulk load, using the T-SQL [FIRE_TRIGGERS](https://technet.microsoft.com/en-us/library/ms187640(v=sql.105).aspx). (default: `false`)
   */
  fireTriggers?: InternalOptions['fireTriggers'] | undefined;

  /**
   * Honors null value passed, ignores the default values set on table, using T-SQL [KEEP_NULLS](https://msdn.microsoft.com/en-us/library/ms187887(v=sql.120).aspx). (default: `false`)
   */
  keepNulls?: InternalOptions['keepNulls'] | undefined;

  /**
   * Places a bulk update(BU) lock on table while performing bulk load, using T-SQL [TABLOCK](https://technet.microsoft.com/en-us/library/ms180876(v=sql.105).aspx). (default: `false`)
   */
  lockTable?: InternalOptions['lockTable'] | undefined;

  /**
   * Specifies the ordering of the data to possibly increase bulk insert performance, using T-SQL [ORDER](https://docs.microsoft.com/en-us/previous-versions/sql/sql-server-2008-r2/ms177468(v=sql.105)). (default: `{}`)
   */
  order?: InternalOptions['order'] | undefined;
}


export type Callback =
  /**
   * A function which will be called after the [[BulkLoad]] finishes executing.
   *
   * @param rowCount the number of rows inserted
   */
  (err: Error | undefined | null, rowCount?: number) => void;

interface Column extends Parameter {
  objName: string;
  collation: Collation | undefined;
}

interface ColumnOptions {
  output?: boolean;

  /**
   * For VarChar, NVarChar, VarBinary. Use length as `Infinity` for VarChar(max), NVarChar(max) and VarBinary(max).
   */
  length?: number;

  /**
   * For Numeric, Decimal.
   */
  precision?: number;

  /**
   * For Numeric, Decimal, Time, DateTime2, DateTimeOffset.
   */
  scale?: number;

  /**
   * If the name of the column is different from the name of the property found on `rowObj` arguments passed to [[addRow]], then you can use this option to specify the property name.
   */
  objName?: string;

  /**
   * Indicates whether the column accepts NULL values.
   */
  nullable?: boolean;
}

const rowTokenBuffer = Buffer.from([ TOKEN_TYPE.ROW ]);
const textPointerAndTimestampBuffer = Buffer.from([
  // TextPointer length
  0x10,

  // TextPointer
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,

  // Timestamp
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);
const textPointerNullBuffer = Buffer.from([0x00]);

export type Row = unknown[] | { [colName: string]: unknown };

const IDLE = Symbol('idle');
const ABORTED = Symbol('aborted');

/**
 * What `serializeRows` needs of a row source: an iterator's `next`, and
 * its `return` if it has one.
 */
export interface RowSource {
  next(): IteratorResult<Row> | PromiseLike<IteratorResult<Row>>;
  return?(): unknown;
}

function ignoreError() {}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return value != null && typeof (value as PromiseLike<T>).then === 'function';
}

/**
 * A BulkLoad instance is used to perform a bulk insert.
 *
 * Use [[Connection.newBulkLoad]] to create a new instance, and [[Connection.execBulkLoad]] to execute it.
 *
 * Example of BulkLoad Usages:
 *
 * ```js
 * // optional BulkLoad options
 * const options = { keepNulls: true };
 *
 * // instantiate - provide the table where you'll be inserting to, options and a callback
 * const bulkLoad = connection.newBulkLoad('MyTable', options, (error, rowCount) => {
 *   console.log('inserted %d rows', rowCount);
 * });
 *
 * // setup your columns - always indicate whether the column is nullable
 * bulkLoad.addColumn('myInt', TYPES.Int, { nullable: false });
 * bulkLoad.addColumn('myString', TYPES.NVarChar, { length: 50, nullable: true });
 *
 * // execute
 * connection.execBulkLoad(bulkLoad, [
 *   { myInt: 7, myString: 'hello' },
 *   { myInt: 23, myString: 'world' }
 * ]);
 * ```
 */
class BulkLoad extends EventEmitter {
  /**
   * @private
   */
  declare error: Error | undefined;
  /**
   * @private
   */
  declare canceled: boolean;
  /**
   * @private
   */
  declare executionStarted: boolean;
  /**
   * @private
   */
  declare table: string;
  /**
   * @private
   */
  declare timeout: number | undefined;

  /**
   * @private
   */
  declare options: InternalConnectionOptions;
  /**
   * @private
   */
  declare callback: Callback;

  /**
   * @private
   */
  declare columns: Array<Column>;
  /**
   * @private
   */
  declare columnsByName: { [name: string]: Column };

  /**
   * @private
   */
  declare firstRowWritten: boolean;
  /**
   * @private
   */
  declare bulkOptions: InternalOptions;

  /**
   * @private
   */
  declare connection: Connection | undefined;
  /**
   * @private
   */
  declare rows: Array<any> | undefined;
  /**
   * @private
   */
  declare rst: Array<any> | undefined;
  /**
   * @private
   */
  declare rowCount: number | undefined;

  declare collation: Collation | undefined;

  /**
   * @private
   */
  constructor(table: string, collation: Collation | undefined, connectionOptions: InternalConnectionOptions, {
    checkConstraints = false,
    fireTriggers = false,
    keepNulls = false,
    lockTable = false,
    order = {},
  }: Options, callback: Callback) {
    if (typeof checkConstraints !== 'boolean') {
      throw new TypeError('The "options.checkConstraints" property must be of type boolean.');
    }

    if (typeof fireTriggers !== 'boolean') {
      throw new TypeError('The "options.fireTriggers" property must be of type boolean.');
    }

    if (typeof keepNulls !== 'boolean') {
      throw new TypeError('The "options.keepNulls" property must be of type boolean.');
    }

    if (typeof lockTable !== 'boolean') {
      throw new TypeError('The "options.lockTable" property must be of type boolean.');
    }

    if (typeof order !== 'object' || order === null) {
      throw new TypeError('The "options.order" property must be of type object.');
    }

    for (const [column, direction] of Object.entries(order)) {
      if (direction !== 'ASC' && direction !== 'DESC') {
        throw new TypeError('The value of the "' + column + '" key in the "options.order" object must be either "ASC" or "DESC".');
      }
    }

    super();

    this.error = undefined;
    this.canceled = false;
    this.executionStarted = false;

    this.collation = collation;

    this.table = table;
    this.options = connectionOptions;
    this.callback = callback;
    this.columns = [];
    this.columnsByName = {};
    this.firstRowWritten = false;

    this.bulkOptions = { checkConstraints, fireTriggers, keepNulls, lockTable, order };
  }

  /**
   * Adds a column to the bulk load.
   *
   * The column definitions should match the table you are trying to insert into.
   * Attempting to call addColumn after the first row has been added will throw an exception.
   *
   * ```js
   * bulkLoad.addColumn('MyIntColumn', TYPES.Int, { nullable: false });
   * ```
   *
   * @param name The name of the column.
   * @param type One of the supported `data types`.
   * @param __namedParameters Additional column type information. At a minimum, `nullable` must be set to true or false.
   * @param length For VarChar, NVarChar, VarBinary. Use length as `Infinity` for VarChar(max), NVarChar(max) and VarBinary(max).
   * @param nullable Indicates whether the column accepts NULL values.
   * @param objName If the name of the column is different from the name of the property found on `rowObj` arguments passed to [[addRow]] or [[Connection.execBulkLoad]], then you can use this option to specify the property name.
   * @param precision For Numeric, Decimal.
   * @param scale For Numeric, Decimal, Time, DateTime2, DateTimeOffset.
  */
  addColumn(name: string, type: DataType, { output = false, length, precision, scale, objName = name, nullable = true }: ColumnOptions) {
    if (this.firstRowWritten) {
      throw new Error('Columns cannot be added to bulk insert after the first row has been written.');
    }
    if (this.executionStarted) {
      throw new Error('Columns cannot be added to bulk insert after execution has started.');
    }

    const column: Column = {
      type: type,
      name: name,
      value: null,
      output: output,
      length: length,
      precision: precision,
      scale: scale,
      objName: objName,
      nullable: nullable,
      collation: this.collation
    };

    if ((type.id & 0x30) === 0x20) {
      if (column.length == null && type.resolveLength) {
        column.length = type.resolveLength(column);
      }
    }

    if (type.resolvePrecision && column.precision == null) {
      column.precision = type.resolvePrecision(column);
    }

    if (type.resolveScale && column.scale == null) {
      column.scale = type.resolveScale(column);
    }

    this.columns.push(column);

    this.columnsByName[name] = column;
  }

  /**
   * @private
   */
  getOptionsSql() {
    const addOptions = [];

    if (this.bulkOptions.checkConstraints) {
      addOptions.push('CHECK_CONSTRAINTS');
    }

    if (this.bulkOptions.fireTriggers) {
      addOptions.push('FIRE_TRIGGERS');
    }

    if (this.bulkOptions.keepNulls) {
      addOptions.push('KEEP_NULLS');
    }

    if (this.bulkOptions.lockTable) {
      addOptions.push('TABLOCK');
    }

    if (this.bulkOptions.order) {
      const orderColumns = [];

      for (const [column, direction] of Object.entries(this.bulkOptions.order)) {
        orderColumns.push(`${column} ${direction}`);
      }

      if (orderColumns.length) {
        addOptions.push(`ORDER (${orderColumns.join(', ')})`);
      }
    }

    if (addOptions.length > 0) {
      return ` WITH (${addOptions.join(',')})`;
    } else {
      return '';
    }
  }

  /**
   * @private
   */
  getBulkInsertSql() {
    let sql = 'insert bulk ' + this.table + '(';
    for (let i = 0, len = this.columns.length; i < len; i++) {
      const c = this.columns[i];
      if (i !== 0) {
        sql += ', ';
      }
      sql += '[' + c.name + '] ' + (c.type.declaration(c));
    }
    sql += ')';

    sql += this.getOptionsSql();
    return sql;
  }

  /**
   * This is simply a helper utility function which returns a `CREATE TABLE SQL` statement based on the columns added to the bulkLoad object.
   * This may be particularly handy when you want to insert into a temporary table (a table which starts with `#`).
   *
   * ```js
   * var sql = bulkLoad.getTableCreationSql();
   * ```
   *
   * A side note on bulk inserting into temporary tables: if you want to access a local temporary table after executing the bulk load,
   * you'll need to use the same connection and execute your requests using [[Connection.execSqlBatch]] instead of [[Connection.execSql]]
   */
  getTableCreationSql() {
    let sql = 'CREATE TABLE ' + this.table + '(\n';
    for (let i = 0, len = this.columns.length; i < len; i++) {
      const c = this.columns[i];
      if (i !== 0) {
        sql += ',\n';
      }
      sql += '[' + c.name + '] ' + (c.type.declaration(c));
      if (c.nullable !== undefined) {
        sql += ' ' + (c.nullable ? 'NULL' : 'NOT NULL');
      }
    }
    sql += '\n)';
    return sql;
  }

  /**
   * @private
   */
  getColMetaData() {
    const tBuf = new WritableTrackingBuffer();
    // TokenType
    tBuf.writeUInt8(TOKEN_TYPE.COLMETADATA);
    // Count
    tBuf.writeUInt16LE(this.columns.length);

    for (let j = 0, len = this.columns.length; j < len; j++) {
      const c = this.columns[j];
      // UserType
      if (this.options.tdsVersion < '7_2') {
        tBuf.writeUInt16LE(0);
      } else {
        tBuf.writeUInt32LE(0);
      }

      // Flags
      let flags = FLAGS.updateableReadWrite;
      if (c.nullable) {
        flags |= FLAGS.nullable;
      } else if (c.nullable === undefined && this.options.tdsVersion >= '7_2') {
        flags |= FLAGS.nullableUnknown;
      }
      tBuf.writeUInt16LE(flags);

      // TYPE_INFO
      tBuf.writeBuffer(c.type.generateTypeInfo(c, this.options));

      // TableName
      if (c.type.hasTableName) {
        tBuf.writeUsVarchar(this.table, 'ucs2');
      }

      // ColName
      tBuf.writeBVarchar(c.name, 'ucs2');
    }
    return tBuf.data;
  }

  /**
   * Sets a timeout for this bulk load.
   *
   * ```js
   * bulkLoad.setTimeout(timeout);
   * ```
   *
   * @param timeout The number of milliseconds before the bulk load is considered failed, or 0 for no timeout.
   *   When no timeout is set for the bulk load, the [[ConnectionOptions.requestTimeout]] of the Connection is used.
   */
  setTimeout(timeout?: number) {
    this.timeout = timeout;
  }

  /**
   * Serializes the rows produced by `iterator` into the TDS byte stream of
   * this bulk load: COLMETADATA, a ROW token per row, and a DONE token at
   * the end.
   *
   * Rows are written into one buffer that lives for the whole bulk load.
   * Its contents are yielded once it holds a chunk's worth
   * (`WritableTrackingBuffer.CHUNK_SIZE`), or as soon as an asynchronous
   * row source goes idle. The second rule matters for a source that
   * yields a row and then waits on something: its rows must not be held
   * back until a chunk has accumulated. That is a guarantee, not an
   * optimization: a source may be waiting on the server's reaction to the
   * rows it has already produced (the cancellation tests do), and would
   * deadlock with them stuck in the buffer. Rows from a synchronous
   * source, or from an asynchronous source that keeps producing, are
   * coalesced up to a full chunk. The unit tests under "row
   * serialization" pin both rules and the abort race below.
   *
   * A row that fails validation or serialization ends the iteration with
   * that error; nothing written for it (or for rows still coalescing with
   * it) is yielded. The row source is closed either way. `abort` is raced
   * against every pending row read, so that a source that signals failure
   * out of band (an `'error'` event) while a read is pending ends the
   * iteration too instead of hanging it, and a consumer that stops early
   * does not wait for the source to close once the bulk load is aborted.
   *
   * @private
   */
  async *serializeRows(iterator: RowSource, abort: Promise<never>): AsyncGenerator<Buffer, void, undefined> {
    const buffer = new WritableTrackingBuffer();
    const options = this.options;
    const columns = this.columns;

    // Resolves once the event loop got a turn, i.e. once the row source
    // stopped producing rows back to back (rows arrive through promises and
    // microtasks, so an immediate only runs when the source is waiting on
    // something). Armed whenever an asynchronous source is awaited and no
    // immediate is pending. One that fired while no row was being awaited
    // (the consumer was slow to pull, or the source handed over a row
    // without a promise) wins the next race outright; that costs one
    // smaller chunk, never a wrong byte, and a flush with nothing
    // buffered is a no-op.
    let idle: Promise<typeof IDLE> | undefined;

    let done = false;
    let failed = false;
    try {
      // Inside the `try` so that a column type that fails to write its
      // TYPE_INFO still closes the source.
      buffer.writeBuffer(this.getColMetaData());

      while (true) {
        let result: IteratorResult<Row> | PromiseLike<IteratorResult<Row>> = iterator.next();

        if (isPromiseLike(result)) {
          // Settled into one promise up front: a thenable that is not a
          // native promise may start its work again on every `then`, and
          // this read can take part in two races.
          const read = Promise.resolve(result);

          idle ??= new Promise((resolve) => { setImmediate(resolve, IDLE); });

          const winner = await Promise.race([read, idle, abort]);
          if (winner === IDLE) {
            idle = undefined;

            if (buffer.length > 0) {
              for (const chunk of buffer.getBuffers()) {
                yield chunk;
              }
              buffer.consume(buffer.length);
            }

            result = await Promise.race([read, abort]);
          } else {
            result = winner;
          }
        }

        if (result.done) {
          done = true;
          break;
        }

        const row = result.value;

        buffer.writeBuffer(rowTokenBuffer);

        for (let i = 0; i < columns.length; i++) {
          const c = columns[i];
          let value = Array.isArray(row) ? row[i] : row[c.objName];

          if (!this.firstRowWritten) {
            value = c.type.validate(value, c.collation);
          }

          const parameter = {
            length: c.length,
            scale: c.scale,
            precision: c.precision,
            value: value
          };

          const isTextType = c.type.name === 'Text' || c.type.name === 'Image' || c.type.name === 'NText';

          if (isTextType && value == null) {
            buffer.writeBuffer(textPointerNullBuffer);
          } else {
            if (isTextType) {
              buffer.writeBuffer(textPointerAndTimestampBuffer);
            }

            buffer.writeBuffer(c.type.generateParameterLength(parameter, options));
            for (const chunk of c.type.generateParameterData(parameter, options)) {
              buffer.writeBuffer(chunk);
            }
          }

          // Checked after every cell (a null text pointer included), not
          // only after every row, so that a wide row of large cells goes
          // downstream as it is serialized rather than accumulating whole.
          if (buffer.length >= WritableTrackingBuffer.CHUNK_SIZE) {
            for (const chunk of buffer.getBuffers()) {
              yield chunk;
            }
            buffer.consume(buffer.length);
          }
        }
      }
    } catch (err) {
      failed = true;
      throw err;
    } finally {
      // Leaving early (a failed row, or the consumer stopped pulling, e.g.
      // because the bulk load was canceled) closes the source as a
      // `for await` would.
      if (!done && typeof iterator.return === 'function') {
        if (failed) {
          // Best effort, and not waited for: the failure must reach the
          // bulk load now, not after the source's cleanup, which may never
          // finish (an async generator queues `return()` behind a `next()`
          // that is still pending, which is exactly what an abort leaves
          // behind). A close failure must not hide the row error either.
          try {
            const closing = iterator.return();
            if (isPromiseLike(closing)) {
              closing.then(undefined, ignoreError);
            }
          } catch {
            // A synchronous source's `finally` threw.
          }
        } else {
          // The consumer stopped pulling; a close failure is what it gets.
          // Unless the bulk load is aborted, now or while the source is
          // closing: it was canceled while a chunk sat with the consumer,
          // and its source may be stuck in a read (an async generator
          // queues `return()` behind it), so the wait could never end.
          const closing = iterator.return();
          if (!isPromiseLike(closing)) {
            await closing;
          } else {
            const settled = Promise.resolve(closing);
            const winner = await Promise.race([settled, abort.then(undefined, () => ABORTED)]);
            if (winner === ABORTED) {
              settled.then(undefined, ignoreError);
            }
          }
        }
      }
    }

    buffer.writeBuffer(this.createDoneToken());
    for (const chunk of buffer.getBuffers()) {
      yield chunk;
    }
    buffer.consume(buffer.length);
  }

  /**
   * @private
   */
  createDoneToken() {
    // It might be nice to make DoneToken a class if anything needs to create them, but for now, just do it here
    const tBuf = new WritableTrackingBuffer();
    tBuf.writeUInt8(TOKEN_TYPE.DONE);
    const status = DONE_STATUS.FINAL;
    tBuf.writeUInt16LE(status);
    tBuf.writeUInt16LE(0); // CurCmd (TDS ignores this)
    tBuf.writeUInt32LE(0); // row count - doesn't really matter
    if (this.options.tdsVersion >= '7_2') {
      tBuf.writeUInt32LE(0); // row count is 64 bits in >= TDS 7.2
    }
    return tBuf.data;
  }

  /**
   * @private
   */
  cancel() {
    if (this.canceled) {
      return;
    }

    this.canceled = true;
    this.emit('cancel');
  }
}

export default BulkLoad;
module.exports = BulkLoad;
