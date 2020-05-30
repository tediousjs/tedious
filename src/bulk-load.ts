import { EventEmitter } from 'events';
import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import Connection, { InternalConnectionOptions } from './connection';

import { Transform } from 'readable-stream';
import { TYPE as TOKEN_TYPE } from './token/token';
import Message from './message';
import { TYPE as PACKET_TYPE } from './packet';

import { DataType, Parameter } from './data-type';
import { RequestError } from './errors';

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

const DONE_STATUS = {
  FINAL: 0x00,
  MORE: 0x1,
  ERROR: 0x2,
  INXACT: 0x4,
  COUNT: 0x10,
  ATTN: 0x20,
  SRVERROR: 0x100
};

interface InternalOptions {
  checkConstraints: boolean;
  fireTriggers: boolean;
  keepNulls: boolean;
  lockTable: boolean;
}

export interface Options {
  checkConstraints?: InternalOptions['checkConstraints'];
  fireTriggers?: InternalOptions['fireTriggers'];
  keepNulls?: InternalOptions['keepNulls'];
  lockTable?: InternalOptions['lockTable'];
}

export type Callback = (err: Error | undefined | null, rowCount?: number) => void;

interface Column extends Parameter {
  objName: string;
}

interface ColumnOptions {
  output?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  objName?: string;
  nullable?: boolean;
}

// A transform that converts rows to packets.
class RowTransform extends Transform {
  columnMetadataWritten: boolean;
  bulkLoad: BulkLoad;
  mainOptions: BulkLoad['options'];
  columns: BulkLoad['columns'];

  constructor(bulkLoad: BulkLoad) {
    super({ writableObjectMode: true });

    this.bulkLoad = bulkLoad;
    this.mainOptions = bulkLoad.options;
    this.columns = bulkLoad.columns;

    this.columnMetadataWritten = false;
  }

  _transform(row: Array<any>, _encoding: string, callback: () => void) {
    if (!this.columnMetadataWritten) {
      this.push(this.bulkLoad.getColMetaData());
      this.columnMetadataWritten = true;
    }

    const buf = new WritableTrackingBuffer(64, 'ucs2', true);
    buf.writeUInt8(TOKEN_TYPE.ROW);
    this.push(buf.data);

    for (let i = 0; i < this.columns.length; i++) {
      const c = this.columns[i];
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

  _flush(callback: () => void) {
    this.push(this.bulkLoad.createDoneToken());

    process.nextTick(callback);
  }
}

class BulkLoad extends EventEmitter {
  error?: Error;
  canceled: boolean;
  executionStarted: boolean;
  streamingMode: boolean;
  table: string;

  connection?: Connection;
  timeout?: number;

  rows?: Array<any>;
  rst?: Array<any>;
  rowCount?: number;

  paused?: boolean;

  options: InternalConnectionOptions;
  callback: Callback;

  columns: Array<Column>;
  columnsByName: { [name: string]: Column };

  firstRowWritten: boolean;
  rowToPacketTransform: RowTransform;

  bulkOptions: InternalOptions;

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

    this.bulkOptions = { checkConstraints, fireTriggers, keepNulls, lockTable };
  }

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

  addRow(...input: [ { [key: string]: any } ] | Array<any>) {
    this.firstRowWritten = true;

    let row: any;
    if (input.length > 1 || !input[0] || typeof input[0] !== 'object') {
      row = input;
    } else {
      row = input[0];
    }

    // write each column
    if (Array.isArray(row)) {
      this.rowToPacketTransform.write(row);
    } else {
      const object = row;
      this.rowToPacketTransform.write(this.columns.map((column) => {
        return object[column.objName];
      }));
    }
  }

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

  setTimeout(timeout?: number) {
    this.timeout = timeout;
  }

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

  // This method switches the BulkLoad object into streaming mode and returns
  // a stream.Writable for streaming rows to the server.
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

  getMessageStream() {
    const message = new Message({ type: PACKET_TYPE.BULK_LOAD });

    this.rowToPacketTransform.pipe(message);

    this.rowToPacketTransform.once('finish', () => {
      this.removeListener('cancel', onCancel);
    });

    const onCancel = () => {
      this.rowToPacketTransform.emit('error', RequestError('Canceled.', 'ECANCEL'));
      this.rowToPacketTransform.destroy();
    };

    this.once('cancel', onCancel);

    return message;
  }

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
