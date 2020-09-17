import { EventEmitter } from 'events';
import { typeByName as TYPES, Parameter, DataType } from './data-type';
import { RequestError } from './errors';

import Connection from './connection';
import { SQLServerStatementColumnEncryptionSetting } from './always-encrypted/types';
import { ColumnMetadata } from './token/colmetadata-token-parser';
import { Metadata } from './metadata-parser';

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
   *   If an error occured, an error object.
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

interface ParameterOptions {
  output?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  collation?: {
    lcid: number;
    flags: number;
    version: number;
    sortId: number;
  };
  forceEncrypt?: boolean;
}

interface RequestOptions {
  statementColumnEncryptionSetting?: SQLServerStatementColumnEncryptionSetting;
}

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
  sqlTextOrProcedure?: string;
  /**
   * @private
   */
  parameters: Parameter[];
  /**
   * @private
   */
  parametersByName: { [key: string]: Parameter };
  /**
   * @private
   */
  originalParameters: Parameter[];
  /**
   * @private
   */
  preparing: boolean;
  /**
   * @private
   */
  canceled: boolean;
  /**
   * @private
   */
  paused: boolean;
  /**
   * @private
   */
  userCallback: CompletionCallback;
  /**
   * @private
   */
  handle?: number;
  /**
   * @private
   */
  error?: Error;
  /**
   * @private
   */
  connection?: Connection;
  /**
   * @private
   */
  timeout?: number;

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
  rowCount?: number;

  /**
   * @private
   */
  callback: CompletionCallback;

  shouldHonorAE?: boolean;
  statementColumnEncryptionSetting: SQLServerStatementColumnEncryptionSetting;
  cryptoMetadataLoaded: boolean;


  /**
   * This event, describing result set columns, will be emitted before row
   * events are emitted. This event may be emited multiple times when more
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
   * An `done` event is emited for each SQL statement in the SQL batch except variable declarations.
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
       *   Will only be avaiable if Connection's [[ConnectionOptions.rowCollectionOnDone]] is `true`.
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
       *   Will only be avaiable if Connection's [[ConnectionOptions.rowCollectionOnDone]] is `true`.
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
       *   Will only be avaiable if Connection's [[ConnectionOptions.rowCollectionOnDone]] is `true`.
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
    this.originalParameters = [];
    this.preparing = false;
    this.handle = undefined;
    this.canceled = false;
    this.paused = false;
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
  addParameter(name: string, type: DataType, value: unknown, options?: ParameterOptions) {
    if (options == null) {
      options = {};
    }

    const {
      output = false,
      length,
      precision,
      scale,
      collation,
      forceEncrypt = false,
    } = options;

    const parameter: Parameter = {
      type: type,
      name: name,
      value: value,
      output: output,
      length: length,
      precision: precision,
      scale: scale,
      collation: collation,
      forceEncrypt: forceEncrypt
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
  addOutputParameter(name: string, type: DataType, value?: unknown, options?: ParameterOptions) {
    if (options == null) {
      options = {};
    }
    options.output = true;
    this.addParameter(name, type, value, options);
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
  transformIntoExecuteSqlRpc() {
    if (this.validateParameters()) {
      return;
    }

    this.originalParameters = this.parameters;
    this.parameters = [];
    this.addParameter('statement', TYPES.NVarChar, this.sqlTextOrProcedure);
    if (this.originalParameters.length) {
      this.addParameter('params', TYPES.NVarChar, this.makeParamsParameter(this.originalParameters));
    }

    for (let i = 0, len = this.originalParameters.length; i < len; i++) {
      const parameter = this.originalParameters[i];
      this.parameters.push(parameter);
    }
    this.sqlTextOrProcedure = 'sp_executesql';
  }

  /**
   * @private
   */
  transformIntoPrepareRpc() {
    this.originalParameters = this.parameters;
    this.parameters = [];
    this.addOutputParameter('handle', TYPES.Int, undefined);
    this.addParameter('params', TYPES.NVarChar, this.makeParamsParameter(this.originalParameters));
    this.addParameter('stmt', TYPES.NVarChar, this.sqlTextOrProcedure);
    this.sqlTextOrProcedure = 'sp_prepare';
    this.preparing = true;
    this.on('returnValue', (name: string, value: any) => {
      if (name === 'handle') {
        this.handle = value;
      } else {
        this.error = RequestError(`Tedious > Unexpected output parameter ${name} from sp_prepare`);
      }
    });
  }

  /**
   * @private
   */
  transformIntoUnprepareRpc() {
    this.parameters = [];
    this.addParameter('handle', TYPES.Int, this.handle);
    this.sqlTextOrProcedure = 'sp_unprepare';
  }

  /**
   * @private
   */
  transformIntoExecuteRpc(parameters: { [key: string]: unknown }) {
    this.parameters = [];
    this.addParameter('handle', TYPES.Int, this.handle);

    for (let i = 0, len = this.originalParameters.length; i < len; i++) {
      const parameter = this.originalParameters[i];
      parameter.value = parameters[parameter.name];
      this.parameters.push(parameter);
    }

    if (this.validateParameters()) {
      return;
    }

    this.sqlTextOrProcedure = 'sp_execute';
  }

  /**
   * @private
   */
  validateParameters() {
    for (let i = 0, len = this.parameters.length; i < len; i++) {
      const parameter = this.parameters[i];
      const value = parameter.type.validate(parameter.value);
      if (value instanceof TypeError) {
        return this.error = new RequestError('Validation failed for parameter \'' + parameter.name + '\'. ' + value.message, 'EPARAM');
      }
      parameter.value = value;
    }
    return null;
  }

  /**
   * Temporarily suspends the flow of data from the database. No more `row` events will be emitted until [[resume] is called.
   * If this request is already in a paused state, calling [[pause]] has no effect.
   */
  pause() {
    if (this.paused) {
      return;
    }
    this.paused = true;
    if (this.connection) {
      this.connection.pauseRequest(this);
    }
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
    if (this.connection) {
      this.connection.resumeRequest(this);
    }
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
module.exports = Request;
