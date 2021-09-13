import { Readable, Transform } from 'stream';
import BulkLoad from './bulk-load';

import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { TYPE as TOKEN_TYPE } from './token/token';
import { Collation } from './collation';
import { InternalConnectionOptions } from './connection';

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

const rowTokenBuffer = Buffer.from([TOKEN_TYPE.ROW]);
const textPointerAndTimestampBuffer = Buffer.from([
  // TextPointer length
  0x10,

  // TextPointer
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,

  // Timestamp
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);
const textPointerNullBuffer = Buffer.from([0x00]);

export class BulkLoadPayload extends Transform {
  bulkLoad: BulkLoad;
  rowStream: Readable;

  mainOptions: InternalConnectionOptions;
  columns: BulkLoad['columns'];
  collation: Collation | undefined;

  constructor(bulkLoad: BulkLoad, rows: AsyncIterable<unknown[] | { [columnName: string]: unknown }> | Iterable<unknown[] | { [columnName: string]: unknown }>, options: InternalConnectionOptions, collation: Collation | undefined) {
    super({ writableObjectMode: true });

    this.bulkLoad = bulkLoad;
    this.mainOptions = options;
    this.columns = bulkLoad.columns;
    this.collation = collation;

    this.rowStream = Readable.from(rows);

    // Destroy the packet transform if an error happens in the row stream,
    // e.g. if an error is thrown from within a generator or stream.
    this.rowStream.on('error', (err) => {
      this.destroy(err);
    });

    this.push(this.getColMetaData());

    this.rowStream.pipe(this);
  }

  _flush(callback: () => void) {
    this.push(this.createDoneToken());

    process.nextTick(callback);
  }

  _transform(row: unknown[] | { [colName: string]: unknown }, _encoding: string, callback: (err?: Error) => void) {
    this.push(rowTokenBuffer);

    for (let i = 0; i < this.columns.length; i++) {
      const c = this.columns[i];
      let value = Array.isArray(row) ? row[i] : row[c.objName];

      try {
        value = c.type.validate(value, this.collation);
      } catch (error: any) {
        return callback(error);
      }

      const parameter = {
        length: c.length,
        scale: c.scale,
        precision: c.precision,
        value: value
      };

      if (c.type.name === 'Text' || c.type.name === 'Image' || c.type.name === 'NText') {
        if (value == null) {
          this.push(textPointerNullBuffer);
          continue;
        }

        this.push(textPointerAndTimestampBuffer);
      }

      this.push(c.type.generateParameterLength(parameter, this.mainOptions));
      for (const chunk of c.type.generateParameterData(parameter, this.mainOptions)) {
        this.push(chunk);
      }
    }

    process.nextTick(callback);
  }

  _destroy(err: Error | null, callback: (error: Error | null) => void) {
    // Destroy the row stream if an error happens in the packet transform,
    // e.g. if the bulk load is cancelled.
    if (err) {
      this.rowStream.destroy(err);
    } else {
      this.rowStream.destroy();
    }

    callback(err);
  }

  createDoneToken() {
    // It might be nice to make DoneToken a class if anything needs to create them, but for now, just do it here
    const tBuf = new WritableTrackingBuffer(this.mainOptions.tdsVersion < '7_2' ? 9 : 13);
    tBuf.writeUInt8(TOKEN_TYPE.DONE);
    const status = DONE_STATUS.FINAL;
    tBuf.writeUInt16LE(status);
    tBuf.writeUInt16LE(0); // CurCmd (TDS ignores this)
    tBuf.writeUInt32LE(0); // row count - doesn't really matter
    if (this.mainOptions.tdsVersion >= '7_2') {
      tBuf.writeUInt32LE(0); // row count is 64 bits in >= TDS 7.2
    }
    return tBuf.data;
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
      if (this.mainOptions.tdsVersion < '7_2') {
        tBuf.writeUInt16LE(0);
      } else {
        tBuf.writeUInt32LE(0);
      }

      // Flags
      let flags = FLAGS.updateableReadWrite;
      if (c.nullable) {
        flags |= FLAGS.nullable;
      } else if (c.nullable === undefined && this.mainOptions.tdsVersion >= '7_2') {
        flags |= FLAGS.nullableUnknown;
      }
      tBuf.writeUInt16LE(flags);

      // TYPE_INFO
      tBuf.writeBuffer(c.type.generateTypeInfo(c, this.mainOptions));

      // TableName
      if (c.type.hasTableName) {
        tBuf.writeUsVarchar(this.bulkLoad.table, 'ucs2');
      }

      // ColName
      tBuf.writeBVarchar(c.name, 'ucs2');
    }
    return tBuf.data;
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
