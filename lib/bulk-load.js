'use strict';

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var EventEmitter = require('events').EventEmitter;
var WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer;
var TOKEN_TYPE = require('./token/token').TYPE;

var FLAGS = {
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

var DONE_STATUS = {
  FINAL: 0x00,
  MORE: 0x1,
  ERROR: 0x2,
  INXACT: 0x4,
  COUNT: 0x10,
  ATTN: 0x20,
  SRVERROR: 0x100
};

module.exports = function (_EventEmitter) {
  (0, _inherits3.default)(BulkLoad, _EventEmitter);

  function BulkLoad(table, options1, callback) {
    (0, _classCallCheck3.default)(this, BulkLoad);

    var _this = (0, _possibleConstructorReturn3.default)(this, (BulkLoad.__proto__ || (0, _getPrototypeOf2.default)(BulkLoad)).call(this));

    _this.error = undefined;
    _this.canceled = false;

    _this.table = table;
    _this.options = options1;
    _this.callback = callback;
    _this.columns = [];
    _this.columnsByName = {};
    _this.rowsData = new WritableTrackingBuffer(1024, 'ucs2', true);
    _this.firstRowWritten = false;
    return _this;
  }

  (0, _createClass3.default)(BulkLoad, [{
    key: 'addColumn',
    value: function addColumn(name, type, options) {
      if (options == null) {
        options = {};
      }

      if (this.firstRowWritten) {
        throw new Error('Columns cannot be added to bulk insert after the first row has been written.');
      }

      var column = {
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

      return this.columnsByName[name] = column;
    }
  }, {
    key: 'addRow',
    value: function addRow(row) {
      this.firstRowWritten = true;

      if (arguments.length > 1 || !row || (typeof row === 'undefined' ? 'undefined' : (0, _typeof3.default)(row)) !== 'object') {
        // convert arguments to array in a way the optimizer can handle
        var arrTemp = new Array(arguments.length);
        for (var i = 0, len = arguments.length; i < len; i++) {
          var c = arguments[i];
          arrTemp[i] = c;
        }
        row = arrTemp;
      }

      // write row token
      this.rowsData.writeUInt8(TOKEN_TYPE.ROW);

      // write each column
      var arr = row instanceof Array;
      for (var _i = 0, _len = this.columns.length; _i < _len; _i++) {
        var _c = this.columns[_i];
        _c.type.writeParameterData(this.rowsData, {
          length: _c.length,
          scale: _c.scale,
          precision: _c.precision,
          value: row[arr ? _i : _c.objName]
        }, this.options);
      }
    }
  }, {
    key: 'getBulkInsertSql',
    value: function getBulkInsertSql() {
      var sql = 'insert bulk ' + this.table + '(';
      for (var i = 0, len = this.columns.length; i < len; i++) {
        var c = this.columns[i];
        if (i !== 0) {
          sql += ', ';
        }
        sql += '[' + c.name + '] ' + c.type.declaration(c);
      }
      sql += ')';
      return sql;
    }
  }, {
    key: 'getTableCreationSql',
    value: function getTableCreationSql() {
      var sql = 'CREATE TABLE ' + this.table + '(\n';
      for (var i = 0, len = this.columns.length; i < len; i++) {
        var c = this.columns[i];
        if (i !== 0) {
          sql += ',\n';
        }
        sql += '[' + c.name + '] ' + c.type.declaration(c);
        if (c.nullable !== void 0) {
          sql += ' ' + (c.nullable ? 'NULL' : 'NOT NULL');
        }
      }
      sql += '\n)';
      return sql;
    }
  }, {
    key: 'getPayload',
    value: function getPayload() {
      // Create COLMETADATA token
      var metaData = this.getColMetaData();
      var length = metaData.length;

      // row data
      var rows = this.rowsData.data;
      length += rows.length;

      // Create DONE token
      // It might be nice to make DoneToken a class if anything needs to create them, but for now, just do it here
      var tBuf = new WritableTrackingBuffer(this.options.tdsVersion < '7_2' ? 9 : 13);
      tBuf.writeUInt8(TOKEN_TYPE.DONE);
      var status = DONE_STATUS.FINAL;
      tBuf.writeUInt16LE(status);
      tBuf.writeUInt16LE(0); // CurCmd (TDS ignores this)
      tBuf.writeUInt32LE(0); // row count - doesn't really matter
      if (this.options.tdsVersion >= '7_2') {
        tBuf.writeUInt32LE(0); // row count is 64 bits in >= TDS 7.2
      }

      var done = tBuf.data;
      length += done.length;

      // composite payload
      var payload = new WritableTrackingBuffer(length);
      payload.copyFrom(metaData);
      payload.copyFrom(rows);
      payload.copyFrom(done);
      return payload;
    }
  }, {
    key: 'getColMetaData',
    value: function getColMetaData() {
      var tBuf = new WritableTrackingBuffer(100, null, true);
      // TokenType
      tBuf.writeUInt8(TOKEN_TYPE.COLMETADATA);
      // Count
      tBuf.writeUInt16LE(this.columns.length);

      for (var j = 0, len = this.columns.length; j < len; j++) {
        var c = this.columns[j];
        // UserType
        if (this.options.tdsVersion < '7_2') {
          tBuf.writeUInt16LE(0);
        } else {
          tBuf.writeUInt32LE(0);
        }

        // Flags
        var flags = FLAGS.updateableReadWrite;
        if (c.nullable) {
          flags |= FLAGS.nullable;
        } else if (c.nullable === void 0 && this.options.tdsVersion >= '7_2') {
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
  }]);
  return BulkLoad;
}(EventEmitter);