'use strict';

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
var util = require('util');

module.exports = function (_EventEmitter) {
  (0, _inherits3.default)(Debug, _EventEmitter);

  /*
    @options    Which debug details should be sent.
                data    - dump of packet data
                payload - details of decoded payload
  */
  function Debug(options) {
    (0, _classCallCheck3.default)(this, Debug);

    var _this = (0, _possibleConstructorReturn3.default)(this, (Debug.__proto__ || (0, _getPrototypeOf2.default)(Debug)).call(this));

    _this.options = options;
    _this.options = _this.options || {};
    _this.options.data = _this.options.data || false;
    _this.options.payload = _this.options.payload || false;
    _this.options.packet = _this.options.packet || false;
    _this.options.token = _this.options.token || false;
    _this.indent = '  ';
    return _this;
  }

  (0, _createClass3.default)(Debug, [{
    key: 'packet',
    value: function packet(direction, _packet) {
      if (this.haveListeners() && this.options.packet) {
        this.log('');
        this.log(direction);
        this.log(_packet.headerToString(this.indent));
      }
    }
  }, {
    key: 'data',
    value: function data(packet) {
      if (this.haveListeners() && this.options.data) {
        this.log(packet.dataToString(this.indent));
      }
    }
  }, {
    key: 'payload',
    value: function payload(generatePayloadText) {
      if (this.haveListeners() && this.options.payload) {
        this.log(generatePayloadText());
      }
    }
  }, {
    key: 'token',
    value: function token(_token) {
      if (this.haveListeners() && this.options.token) {
        this.log(util.inspect(_token, false, 5, true));
      }
    }
  }, {
    key: 'haveListeners',
    value: function haveListeners() {
      return this.listeners('debug').length > 0;
    }
  }, {
    key: 'log',
    value: function log(text) {
      this.emit('debug', text);
    }
  }]);
  return Debug;
}(EventEmitter);