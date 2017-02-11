'use strict';

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer;
var writeAllHeaders = require('./all-headers').writeToTrackingBuffer;

// const OPTION = {
//   WITH_RECOMPILE: 0x01,
//   NO_METADATA: 0x02,
//   REUSE_METADATA: 0x04
// };

var STATUS = {
  BY_REF_VALUE: 0x01,
  DEFAULT_VALUE: 0x02
};

/*
  s2.2.6.5
 */
module.exports = function () {
  function RpcRequestPayload(request, txnDescriptor, options) {
    (0, _classCallCheck3.default)(this, RpcRequestPayload);

    this.request = request;
    this.procedure = this.request.sqlTextOrProcedure;

    var buffer = new WritableTrackingBuffer(500);
    if (options.tdsVersion >= '7_2') {
      var outstandingRequestCount = 1;
      writeAllHeaders(buffer, txnDescriptor, outstandingRequestCount);
    }

    if (typeof this.procedure === 'string') {
      buffer.writeUsVarchar(this.procedure);
    } else {
      buffer.writeUShort(0xFFFF);
      buffer.writeUShort(this.procedure);
    }

    var optionFlags = 0;
    buffer.writeUInt16LE(optionFlags);

    var parameters = this.request.parameters;
    for (var i = 0, len = parameters.length; i < len; i++) {
      var parameter = parameters[i];
      buffer.writeBVarchar('@' + parameter.name);

      var statusFlags = 0;
      if (parameter.output) {
        statusFlags |= STATUS.BY_REF_VALUE;
      }
      buffer.writeUInt8(statusFlags);

      var param = {
        value: parameter.value
      };

      var type = parameter.type;

      if ((type.id & 0x30) === 0x20) {
        if (parameter.length) {
          param.length = parameter.length;
        } else if (type.resolveLength) {
          param.length = type.resolveLength(parameter);
        }
      }

      if (type.hasPrecision) {
        if (parameter.precision) {
          param.precision = parameter.precision;
        } else if (type.resolvePrecision) {
          param.precision = type.resolvePrecision(parameter);
        }
      }

      if (type.hasScale) {
        if (parameter.scale) {
          param.scale = parameter.scale;
        } else if (type.resolveScale) {
          param.scale = type.resolveScale(parameter);
        }
      }

      type.writeTypeInfo(buffer, param, options);
      type.writeParameterData(buffer, param, options);
    }

    this.data = buffer.data;
  }

  (0, _createClass3.default)(RpcRequestPayload, [{
    key: 'toString',
    value: function toString(indent) {
      indent || (indent = '');
      return indent + ('RPC Request - ' + this.procedure);
    }
  }]);
  return RpcRequestPayload;
}();