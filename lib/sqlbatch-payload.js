'use strict';

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer;
var writeAllHeaders = require('./all-headers').writeToTrackingBuffer;

/*
  s2.2.6.6
 */
module.exports = function () {
  function SqlBatchPayload(sqlText, txnDescriptor, options) {
    (0, _classCallCheck3.default)(this, SqlBatchPayload);

    this.sqlText = sqlText;

    var buffer = new WritableTrackingBuffer(100 + 2 * this.sqlText.length, 'ucs2');
    if (options.tdsVersion >= '7_2') {
      var outstandingRequestCount = 1;
      writeAllHeaders(buffer, txnDescriptor, outstandingRequestCount);
    }
    buffer.writeString(this.sqlText, 'ucs2');
    this.data = buffer.data;
  }

  (0, _createClass3.default)(SqlBatchPayload, [{
    key: 'toString',
    value: function toString(indent) {
      indent || (indent = '');
      return indent + ('SQL Batch - ' + this.sqlText);
    }
  }]);
  return SqlBatchPayload;
}();