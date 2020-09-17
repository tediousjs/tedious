import { EventEmitter } from 'events';
import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import Connection, { InternalConnectionOptions } from './connection';

import { Transform } from 'readable-stream';
import { TYPE as TOKEN_TYPE } from './token/token';
import Message from './message';
import { TYPE as PACKET_TYPE } from './packet';

import { DataType, Parameter } from './data-type';
import { RequestError } from './errors';

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
}

export interface Options {
  /**
   * Honors constraints during bulk load, using T-SQL
   * [CHECK_CONSTRAINTS](https://technet.microsoft.com/en-us/library/ms186247(v=sql.105).aspx).
   * (default: `false`)
   */
  checkConstraints?: InternalOptions['checkConstraints'];

  /**
   * Honors insert triggers during bulk load, using the T-SQL [FIRE_TRIGGERS](https://technet.microsoft.com/en-us/library/ms187640(v=sql.105).aspx). (default: `false`)
   */
  fireTriggers?: InternalOptions['fireTriggers'];

  /**
   * Honors null value passed, ignores the default values set on table, using T-SQL [KEEP_NULLS](https://msdn.microsoft.com/en-us/library/ms187887(v=sql.120).aspx). (default: `false`)
   */
  keepNulls?: InternalOptions['keepNulls'];

  /**
   * Places a bulk update(BU) lock on table while performing bulk load, using T-SQL [TABLOCK](https://technet.microsoft.com/en-us/library/ms180876(v=sql.105).aspx). (default: `false`)
   */
  lockTable?: InternalOptions['lockTable'];
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

// A transform that converts rows to packets.
class RowTransform extends Transform {
  /**
   * @private
   */
  columnMetadataWritten: boolean;
  /**
   * @private
   */
  bulkLoad: BulkLoad;
  /**
   * @private
   */
  mainOptions: BulkLoad['options'];
  /**
   * @private
   */
  columns: BulkLoad['columns'];

  /**
   * @private
   */
  constructor(bulkLoad: BulkLoad) {
    super({ writableObjectMode: true });

    this.bulkLoad = bulkLoad;
    this.mainOptions = bulkLoad.options;
    this.columns = bulkLoad.columns;

    this.columnMetadataWritten = false;
  }

  /**
   * @private
   */
  _transform(row: Array<any>, _encoding: string, callback: (error?: Error) => void) {
    if (!this.columnMetadataWritten) {
      this.push(this.bulkLoad.getColMetaData());
      this.columnMetadataWritten = true;
    }

    const buf = new WritableTrackingBuffer(64, 'ucs2', true);
    buf.writeUInt8(TOKEN_TYPE.ROW);
    this.push(buf.data);

    for (let i = 0; i < this.columns.length; i++) {
      const c = this.columns[i];
      if (this.bulkLoad.options.validateBulkLoadParameters) {
        const error = c.type.validate(row[i]);

        if (error instanceof TypeError) {
          return callback(error);
        }
      }
      const parameter = {
        length: c.length,
        scale: c.scale,
        precision: c.precision,
        value: row[i]
      };

      for (const chunk of c.type.generateParameterData(parameter, this.mainOptions)) {
        this.push(chunk);
      }
    }

    process.nextTick(callback);
  }

  /**
   * @private
   */
  _flush(callback: () => void) {
    this.push(this.bulkLoad.createDoneToken());

    process.nextTick(callback);
  }
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
 * // add rows
 * bulkLoad.addRow({ myInt: 7, myString: 'hello' });
 * bulkLoad.addRow({ myInt: 23, myString: 'world' });
 *
 * // execute
 * connection.execBulkLoad(bulkLoad);
 * ```
 */
class BulkLoad extends EventEmitter {
  /**
   * @private
   */
  error?: Error;
  /**
   * @private
   */
  canceled: boolean;
  /**
   * @private
   */
  executionStarted: boolean;
  /**
   * @private
   */
  streamingMode: boolean;
  /**
   * @private
   */
  table: string;
  /**
   * @private
   */
  timeout?: number

  /**
   * @private
   */
  options: InternalConnectionOptions;
  /**
   * @private
   */
  callback: Callback;

  /**
   * @private
   */
  columns: Array<Column>;
  /**
   * @private
   */
  columnsByName: { [name: string]: Column };

  /**
   * @private
   */
  firstRowWritten: boolean;
  /**
   * @private
   */
  rowToPacketTransform: RowTransform;
  message: Message;

  /**
   * @private
   */
  bulkOptions: InternalOptions;

  /**
   * @private
   */
  connection?: Connection;
  /**
   * @private
   */
  rows?: Array<any>;
  /**
   * @private
   */
  rst?: Array<any>;
  /**
   * @private
   */
  rowCount?: number;;

  /**
   * @private
   */
  constructor(table: string, connectionOptions: InternalConnectionOptions, {
    checkConstraints = false,
    fireTriggers = false,
    keepNulls = false,
    lockTable = false,
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

    super();

    this.error = undefined;
    this.canceled = false;
    this.executionStarted = false;

    this.table = table;
    this.options = connectionOptions;
    this.callback = callback;
    this.columns = [];
    this.columnsByName = {};
    this.firstRowWritten = false;
    this.streamingMode = false;

    this.rowToPacketTransform = new RowTransform(this); // eslint-disable-line no-use-before-define
    this.message = new Message({ type: PACKET_TYPE.BULK_LOAD });
    this.rowToPacketTransform.pipe(this.message);

    this.rowToPacketTransform.once('finish', () => {
      this.removeListener('cancel', onCancel);
    });

    this.rowToPacketTransform.once('error', (err) => {
      this.rowToPacketTransform.unpipe(this.message);

      this.error = err;

      this.message.ignore = true;
      this.message.end();
    });

    const onCancel = () => {
      this.rowToPacketTransform.emit('error', RequestError('Canceled.', 'ECANCEL'));
      this.rowToPacketTransform.destroy();
    };

    this.once('cancel', onCancel);

    this.bulkOptions = { checkConstraints, fireTriggers, keepNulls, lockTable };
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
   * @param __namedParameters Type [[ColumnOptions]]<p> Additional column type information. At a minimum, `nullable` must be set to true or false.
   * @param length For VarChar, NVarChar, VarBinary. Use length as `Infinity` for VarChar(max), NVarChar(max) and VarBinary(max).
   * @param nullable Indicates whether the column accepts NULL values.
   * @param objName  If the name of the column is different from the name of the property found on `rowObj` arguments passed to [[addRow]], then you can use this option to specify the property name.
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

    const column = {
      type: type,
      name: name,
      value: null,
      output: output,
      length: length,
      precision: precision,
      scale: scale,
      objName: objName,
      nullable: nullable
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
  colTypeValidation(column: Column, value: any) {
    if (this.options.validateBulkLoadParameters) {
      const error = column.type.validate(value);
      if (error instanceof TypeError) {
        throw error;
      }
    }
  }

  /**
   * Adds a row to the bulk insert. This method accepts arguments in three different formats:
   *
   * ```js
   * bulkLoad.addRow( rowObj )
   * bulkLoad.addRow( columnArray )
   * bulkLoad.addRow( col0, col1, ... colN )`
   * ```
   * * `rowObj`
   *
   *    An object of key/value pairs representing column name (or objName) and value.
   *
   * * `columnArray`
   *
   *    An array representing the values of each column in the same order which they were added to the bulkLoad object.
   *
   * * `col0, col1, ... colN`
   *
   *    If there are at least two columns, values can be passed as multiple arguments instead of an array. They
   *    must be in the same order the columns were added in.
   *
   * @param input
   */
  addRow(...input: [{ [key: string]: any }] | Array<any>) {
    this.firstRowWritten = true;

    let row: any;
    if (input.length > 1 || !input[0] || typeof input[0] !== 'object') {
      row = input;
    } else {
      row = input[0];
    }

    // write each column
    if (Array.isArray(row)) {
      this.columns.forEach((column, i) => {
        this.colTypeValidation(column, row[i]);
      });

      this.rowToPacketTransform.write(row);
    } else {
      this.columns.forEach((column) => {
        this.colTypeValidation(column, row[column.objName]);
      });

      this.rowToPacketTransform.write(this.columns.map((column) => {
        return row[column.objName];
      }));
    }
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
    const tBuf = new WritableTrackingBuffer(100, null, true);
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
   * @private
   */
  createDoneToken() {
    // It might be nice to make DoneToken a class if anything needs to create them, but for now, just do it here
    const tBuf = new WritableTrackingBuffer(this.options.tdsVersion < '7_2' ? 9 : 13);
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
   * Switches the `BulkLoad` object into streaming mode and returns a
   * [writable stream](https://nodejs.org/dist/latest-v10.x/docs/api/stream.html#stream_writable_streams)
   * that can be used to send a large amount of rows to the server.
   *
   * ```js
   * const bulkLoad = connection.newBulkLoad(...);
   * bulkLoad.addColumn(...);
   *
   * const rowStream = bulkLoad.getRowStream();
   *
   * connection.execBulkLoad(bulkLoad);
   * ```
   *
   * In streaming mode, [[addRow]] cannot be used. Instead all data rows must be written to the returned stream object.
   * The stream implementation uses data flow control to prevent memory overload. [`stream.write()`](https://nodejs.org/dist/latest-v10.x/docs/api/stream.html#stream_writable_write_chunk_encoding_callback)
   * returns `false` to indicate that data transfer should be paused.
   *
   * After that, the stream emits a ['drain' event](https://nodejs.org/dist/latest-v10.x/docs/api/stream.html#stream_event_drain)
   * when it is ready to resume data transfer.
   */
  getRowStream() {
    if (this.firstRowWritten) {
      throw new Error('BulkLoad cannot be switched to streaming mode after first row has been written using addRow().');
    }
    if (this.executionStarted) {
      throw new Error('BulkLoad cannot be switched to streaming mode after execution has started.');
    }
    this.streamingMode = true;

    return this.rowToPacketTransform;
  }

  /**
   * @private
   */
  getMessageStream() {
    return this.message;
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
