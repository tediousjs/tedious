'use strict';

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var stream = require('readable-stream');
var BufferList = require('bl');

var Job = function Job(length, execute) {
  (0, _classCallCheck3.default)(this, Job);

  this.length = length;
  this.execute = execute;
};

// These jobs are non-dynamic, so we can reuse the job objects.
// This should reduce GC pressure a bit (as less objects will be
// created and garbage collected during stream parsing).


var JOBS = {
  readInt8: new Job(1, function (buffer, offset) {
    return buffer.readInt8(offset);
  }),
  readUInt8: new Job(1, function (buffer, offset) {
    return buffer.readUInt8(offset);
  }),
  readInt16LE: new Job(2, function (buffer, offset) {
    return buffer.readInt16LE(offset);
  }),
  readInt16BE: new Job(2, function (buffer, offset) {
    return buffer.readInt16BE(offset);
  }),
  readUInt16LE: new Job(2, function (buffer, offset) {
    return buffer.readUInt16LE(offset);
  }),
  readUInt16BE: new Job(2, function (buffer, offset) {
    return buffer.readUInt16BE(offset);
  }),
  readInt32LE: new Job(4, function (buffer, offset) {
    return buffer.readInt32LE(offset);
  }),
  readInt32BE: new Job(4, function (buffer, offset) {
    return buffer.readInt32BE(offset);
  }),
  readUInt32LE: new Job(4, function (buffer, offset) {
    return buffer.readUInt32LE(offset);
  }),
  readUInt32BE: new Job(4, function (buffer, offset) {
    return buffer.readUInt32BE(offset);
  }),
  readInt64LE: new Job(8, function (buffer, offset) {
    return Math.pow(2, 32) * buffer.readInt32LE(offset + 4) + (buffer[offset + 4] & 0x80 === 0x80 ? 1 : -1) * buffer.readUInt32LE(offset);
  }),
  readInt64BE: new Job(8, function (buffer, offset) {
    return Math.pow(2, 32) * buffer.readInt32BE(offset) + (buffer[offset] & 0x80 === 0x80 ? 1 : -1) * buffer.readUInt32BE(offset + 4);
  }),
  readUInt64LE: new Job(8, function (buffer, offset) {
    return Math.pow(2, 32) * buffer.readUInt32LE(offset + 4) + buffer.readUInt32LE(offset);
  }),
  readUInt64BE: new Job(8, function (buffer, offset) {
    return Math.pow(2, 32) * buffer.readUInt32BE(offset) + buffer.readUInt32BE(offset + 4);
  }),
  readFloatLE: new Job(4, function (buffer, offset) {
    return buffer.readFloatLE(offset);
  }),
  readFloatBE: new Job(4, function (buffer, offset) {
    return buffer.readFloatBE(offset);
  }),
  readDoubleLE: new Job(8, function (buffer, offset) {
    return buffer.readDoubleLE(offset);
  }),
  readDoubleBE: new Job(8, function (buffer, offset) {
    return buffer.readDoubleBE(offset);
  })
};

var StreamParser = function (_stream$Transform) {
  (0, _inherits3.default)(StreamParser, _stream$Transform);

  function StreamParser(options) {
    (0, _classCallCheck3.default)(this, StreamParser);

    options = options || {};

    if (options.objectMode === undefined) {
      options.objectMode = true;
    }

    var _this = (0, _possibleConstructorReturn3.default)(this, (StreamParser.__proto__ || (0, _getPrototypeOf2.default)(StreamParser)).call(this, options));

    _this.buffer = new BufferList();
    _this.generator = undefined;
    _this.currentStep = undefined;
    return _this;
  }

  (0, _createClass3.default)(StreamParser, [{
    key: 'parser',
    value: function parser() {
      throw new Error('Not implemented');
    }
  }, {
    key: '_transform',
    value: function _transform(input, encoding, done) {
      this.buffer.append(input);

      if (!this.generator) {
        this.generator = this.parser();
        this.currentStep = this.generator.next();
      }

      var offset = 0;
      while (!this.currentStep.done) {
        var job = this.currentStep.value;
        if (!(job instanceof Job)) {
          return done(new Error('invalid job type'));
        }

        var length = job.length;
        if (this.buffer.length - offset < length) {
          break;
        }

        var result = job.execute(this.buffer, offset);
        offset += length;
        this.currentStep = this.generator.next(result);
      }

      this.buffer.consume(offset);

      if (this.currentStep.done) {
        this.push(null);
      }

      done();
    }
  }, {
    key: 'readBuffer',
    value: function readBuffer(length) {
      return new Job(length, function (buffer, offset) {
        return buffer.slice(offset, offset + length);
      });
    }
  }, {
    key: 'readString',
    value: function readString(length) {
      return new Job(length, function (buffer, offset) {
        return buffer.toString('utf8', offset, offset + length);
      });
    }
  }, {
    key: 'skip',
    value: function skip(length) {
      return new Job(length, function () {});
    }
  }]);
  return StreamParser;
}(stream.Transform);

module.exports = StreamParser;

(0, _keys2.default)(JOBS).forEach(function (jobName) {
  return StreamParser.prototype[jobName] = function () {
    return JOBS[jobName];
  };
});