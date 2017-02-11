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
var StreamParser = require('./stream-parser');

/*
  Buffers are thrown at the parser (by calling addBuffer).
  Tokens are parsed from the buffer until there are no more tokens in
  the buffer, or there is just a partial token left.
  If there is a partial token left over, then it is kept until another
  buffer is added, which should contain the remainder of the partial
  token, along with (perhaps) more tokens.
  The partial token and the new buffer are concatenated, and the token
  parsing resumes.
 */

var Parser = function (_EventEmitter) {
  (0, _inherits3.default)(Parser, _EventEmitter);

  function Parser(debug, colMetadata, options) {
    (0, _classCallCheck3.default)(this, Parser);

    var _this = (0, _possibleConstructorReturn3.default)(this, (Parser.__proto__ || (0, _getPrototypeOf2.default)(Parser)).call(this));

    _this.debug = debug;
    _this.colMetadata = _this.colMetadata;
    _this.options = options;

    _this.parser = new StreamParser(_this.debug, _this.colMetadata, _this.options);
    _this.parser.on('data', function (token) {
      if (token.event) {
        _this.emit(token.event, token);
      }
    });
    return _this;
  }

  (0, _createClass3.default)(Parser, [{
    key: 'addBuffer',
    value: function addBuffer(buffer) {
      return this.parser.write(buffer);
    }
  }, {
    key: 'isEnd',
    value: function isEnd() {
      return this.parser.buffer.length === this.parser.position;
    }
  }]);
  return Parser;
}(EventEmitter);

module.exports.Parser = Parser;