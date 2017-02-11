'use strict';

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer');
var writeAllHeaders = require('./all-headers').writeToTrackingBuffer;

/*
  s2.2.6.8
 */

var OPERATION_TYPE = module.exports.OPERATION_TYPE = {
  TM_GET_DTC_ADDRESS: 0x00,
  TM_PROPAGATE_XACT: 0x01,
  TM_BEGIN_XACT: 0x05,
  TM_PROMOTE_XACT: 0x06,
  TM_COMMIT_XACT: 0x07,
  TM_ROLLBACK_XACT: 0x08,
  TM_SAVE_XACT: 0x09
};

var ISOLATION_LEVEL = module.exports.ISOLATION_LEVEL = {
  NO_CHANGE: 0x00,
  READ_UNCOMMITTED: 0x01,
  READ_COMMITTED: 0x02,
  REPEATABLE_READ: 0x03,
  SERIALIZABLE: 0x04,
  SNAPSHOT: 0x05
};

var isolationLevelByValue = {};
for (var name in ISOLATION_LEVEL) {
  var value = ISOLATION_LEVEL[name];
  isolationLevelByValue[value] = name;
}

var Transaction = function () {
  function Transaction(name, isolationLevel) {
    (0, _classCallCheck3.default)(this, Transaction);

    this.name = name;
    this.isolationLevel = isolationLevel;
    this.outstandingRequestCount = 1;
  }

  (0, _createClass3.default)(Transaction, [{
    key: 'beginPayload',
    value: function beginPayload(txnDescriptor) {
      var _this = this;

      var buffer = new WritableTrackingBuffer(100, 'ucs2');
      writeAllHeaders(buffer, txnDescriptor, this.outstandingRequestCount);
      buffer.writeUShort(OPERATION_TYPE.TM_BEGIN_XACT);
      buffer.writeUInt8(this.isolationLevel);
      buffer.writeUInt8(this.name.length * 2);
      buffer.writeString(this.name, 'ucs2');

      return {
        data: buffer.data,
        toString: function toString() {
          return 'Begin Transaction: name=' + _this.name + ', isolationLevel=' + isolationLevelByValue[_this.isolationLevel];
        }
      };
    }
  }, {
    key: 'commitPayload',
    value: function commitPayload(txnDescriptor) {
      var _this2 = this;

      var buffer = new WritableTrackingBuffer(100, 'ascii');
      writeAllHeaders(buffer, txnDescriptor, this.outstandingRequestCount);
      buffer.writeUShort(OPERATION_TYPE.TM_COMMIT_XACT);
      buffer.writeUInt8(this.name.length * 2);
      buffer.writeString(this.name, 'ucs2');
      // No fBeginXact flag, so no new transaction is started.
      buffer.writeUInt8(0);

      return {
        data: buffer.data,
        toString: function toString() {
          return 'Commit Transaction: name=' + _this2.name;
        }
      };
    }
  }, {
    key: 'rollbackPayload',
    value: function rollbackPayload(txnDescriptor) {
      var _this3 = this;

      var buffer = new WritableTrackingBuffer(100, 'ascii');
      writeAllHeaders(buffer, txnDescriptor, this.outstandingRequestCount);
      buffer.writeUShort(OPERATION_TYPE.TM_ROLLBACK_XACT);
      buffer.writeUInt8(this.name.length * 2);
      buffer.writeString(this.name, 'ucs2');
      // No fBeginXact flag, so no new transaction is started.
      buffer.writeUInt8(0);

      return {
        data: buffer.data,
        toString: function toString() {
          return 'Rollback Transaction: name=' + _this3.name;
        }
      };
    }
  }, {
    key: 'savePayload',
    value: function savePayload(txnDescriptor) {
      var _this4 = this;

      var buffer = new WritableTrackingBuffer(100, 'ascii');
      writeAllHeaders(buffer, txnDescriptor, this.outstandingRequestCount);
      buffer.writeUShort(OPERATION_TYPE.TM_SAVE_XACT);
      buffer.writeUInt8(this.name.length * 2);
      buffer.writeString(this.name, 'ucs2');

      return {
        data: buffer.data,
        toString: function toString() {
          return 'Save Transaction: name=' + _this4.name;
        }
      };
    }
  }, {
    key: 'isolationLevelToTSQL',
    value: function isolationLevelToTSQL() {
      switch (this.isolationLevel) {
        case ISOLATION_LEVEL.READ_UNCOMMITTED:
          return 'READ UNCOMMITTED';
        case ISOLATION_LEVEL.READ_COMMITTED:
          return 'READ COMMITTED';
        case ISOLATION_LEVEL.REPEATABLE_READ:
          return 'REPEATABLE READ';
        case ISOLATION_LEVEL.SERIALIZABLE:
          return 'SERIALIZABLE';
        case ISOLATION_LEVEL.SNAPSHOT:
          return 'SNAPSHOT';
      }
      return '';
    }
  }]);
  return Transaction;
}();

module.exports.Transaction = Transaction;