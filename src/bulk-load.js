const EventEmitter = require('events').EventEmitter;
const Transform = require('readable-stream').Transform;
const WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer');
const TOKEN_TYPE = require('./token/token').TYPE;
const Packet = require('./packet').Packet;
const packetHeaderLength = require('./packet').HEADER_LENGTH;
const PACKET_TYPE = require('./packet').TYPE;

const FLAGS = {
  nullable: 1 << 0,
  caseSen: 1 << 1,
  updateableReadWrite: 1 << 2,
  updateableUnknown: 1 << 3,
  identity: 1 << 4,
  computed: 1 << 5,         // introduced in TDS 7.2
  fixedLenCLRType: 1 << 8,  // introduced in TDS 7.2
  sparseColumnSet: 1 << 10, // introduced in TDS 7.3.B
  hidden: 1 << 13,          // introduced in TDS 7.2
  key: 1 << 14,             // introduced in TDS 7.2
  nullableUnknown: 1 << 15  // introduced in TDS 7.2
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

// Note that the Connection module uses this class in the same way as the Request class.
module.exports = class BulkLoad extends EventEmitter {
  constructor(table, connectionOptions, {
    checkConstraints = false,
    fireTriggers = false,
    keepNulls = false,
    lockTable = false,
  }, connection, callback) {
    super();

    this.isBulkLoad = true;
    this.error = undefined;
    this.canceled = false;
    this.executionStarted = false;

    this.table = table;
    this.options = connectionOptions;
    this.connection = connection;
    const userCallback = callback;
    this.callback = (err, rowCount) => {
      this.stopStreaming();
      userCallback(err, rowCount);
    };
    this.columns = [];
    this.columnsByName = {};
    this.firstRowWritten = false;
    this.streamingMode = false;

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

    this.bulkOptions = { checkConstraints, fireTriggers, keepNulls, lockTable };
  }

  addColumn(name, type, options) {
    if (options == null) {
      options = {};
    }

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
      output: options.output || (options.output = false),
      length: options.length,
      precision: options.precision,
      scale: options.scale,
      objName: options.objName || name,
      nullable: options.nullable
    };

    if ((type.id & 0x30) === 0x20) {
      if (column.length == undefined && type.resolveLength) {
        column.length = type.resolveLength(column);
      }
    }

    if (type.hasPrecision) {
      if (column.precision == undefined && type.resolvePrecision) {
        column.precision = type.resolvePrecision(column);
      }
    }

    if (type.hasScale) {
      if (column.scale == undefined && type.resolveScale) {
        column.scale = type.resolveScale(column);
      }
    }

    this.columns.push(column);

    this.columnsByName[name] = column;
  }

  addRow(row) {
    if (this.streamingMode) {
      throw new Error('BulkLoad.addRow() cannot be used in streaming mode.');
    }
    if (!this.rowsData) {
      this.rowsData = new WritableTrackingBuffer(1024, 'ucs2', true);
    }
    this.firstRowWritten = true;

    if (arguments.length > 1 || !row || typeof row !== 'object') {
      // convert arguments to array in a way the optimizer can handle
      const arrTemp = new Array(arguments.length);
      for (let i = 0, len = arguments.length; i < len; i++) {
        const c = arguments[i];
        arrTemp[i] = c;
      }
      row = arrTemp;
    }

    // write row token
    this.rowsData.writeUInt8(TOKEN_TYPE.ROW);

    // write each column
    const arr = row instanceof Array;
    for (let i = 0, len = this.columns.length; i < len; i++) {
      const c = this.columns[i];
      c.type.writeParameterData(this.rowsData, {
        length: c.length,
        scale: c.scale,
        precision: c.precision,
        value: row[arr ? i : c.objName]
      }, this.options);
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

  getPayload() {
    // Create COLMETADATA token
    const metaData = this.getColMetaData();
    let length = metaData.length;

    // row data
    const rows = this.rowsData ? this.rowsData.data : new Buffer(0);
    length += rows.length;

    // Create DONE token
    const done = this.createDoneToken();
    length += done.length;

    // composite payload
    const payload = new WritableTrackingBuffer(length);
    payload.copyFrom(metaData);
    payload.copyFrom(rows);
    payload.copyFrom(done);
    return payload;
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
      c.type.writeTypeInfo(tBuf, c, this.options);

      // ColName
      tBuf.writeBVarchar(c.name, 'ucs2');
    }
    return tBuf.data;
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
    if (!this.rowToPacketTransform) {
      this.rowToPacketTransform = new RowToPacketTransform(this);
    }
    this.streamingMode = true;
    return this.rowToPacketTransform;
  }

  // This internal method is called to start streaming once the bulk insert
  // command has completed.
  startStreaming() {
    const messageIo = this.connection.messageIo;
    this.rowToPacketTransform.on('data', (packet) => {
      const ret = messageIo.sendPacket(packet);
      if (ret === false) {
        this.rowToPacketTransform.pause();
        messageIo.once('drain', () => {
          this.rowToPacketTransform.resume();
        });
      }
    });
  }

  // This internal method is called to stop streaming when the TDS driver
  // leaves the SENT_CLIENT_REQUEST state.
  stopStreaming() {
    if (!this.streamingMode) {
      return; }
    this.rowToPacketTransform.removeAllListeners('data');
  }
};

// A transform that converts rows to packets.
class RowToPacketTransform extends Transform {

  constructor(bulkLoad) {
    const streamOptions = {objectMode: true };
    super(streamOptions);
    this.bulkLoad = bulkLoad;
    this.mainOptions = bulkLoad.options;
    this.columns = bulkLoad.columns;
    this.packetDataSize = bulkLoad.connection.messageIo.packetSize() - packetHeaderLength;
    this.packetCount = 0;
    this.buf = new WritableTrackingBuffer(2 * this.packetDataSize, 'ucs2', true);
    this.buf.copyFrom(bulkLoad.getColMetaData());
  }

  _transform(row, encoding, callback) {
    this.appendRowToBuffer(row);
    this.pushPackets(false);
    callback();
  }

  _flush(callback) {
    this.buf.copyFrom(this.bulkLoad.createDoneToken());
    this.pushPackets(true);
    callback();
  }

  appendRowToBuffer(row) {
    this.buf.writeUInt8(TOKEN_TYPE.ROW);
    for (let i = 0; i < this.columns.length; i++) {
      const c = this.columns[i];
      c.type.writeParameterData(this.buf, {
        length: c.length,
        scale: c.scale,
        precision: c.precision,
        value: row[i]
      }, this.mainOptions);
    }
  }

  pushPackets(flush) {
    const dataLen = this.buf.getPosition();
    if (!flush && dataLen < this.packetDataSize || dataLen === 0) {
      return; }
    const n = flush ? Math.floor((dataLen + this.packetDataSize - 1) / this.packetDataSize) : Math.floor(dataLen / this.packetDataSize);
       // n is the number of packets to send
    const dataBuf = this.buf.normalizeBuffer();
    for (let i = 0; i < n; i++) {
      const packetData = dataBuf.slice(i * this.packetDataSize, Math.min((i + 1) * this.packetDataSize, dataLen));
      const lastPacket = flush && i === n - 1;
      this.pushPacket(packetData, lastPacket);
    }
    const endPos = n * this.packetDataSize;
    if (endPos >= dataLen) {
      // No remaining data in buffer.
      this.buf.setPosition(0);
    } else {
      // Move remaining data to start of buffer.
      dataBuf.copy(dataBuf, 0, endPos, dataLen);
      this.buf.setPosition(dataLen - endPos);
    }
  }

  pushPacket(packetData, lastPacket) {
    const packet = new Packet(PACKET_TYPE.BULK_LOAD);
    packet.last(lastPacket);
    packet.packetId(this.packetCount + 1);
    packet.addData(packetData);
    this.push(packet);
    this.packetCount++;
  }
}
