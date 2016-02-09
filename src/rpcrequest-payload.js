'use strict';

const WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer;
const writeAllHeaders = require('./all-headers').writeToTrackingBuffer;

// const OPTION = {
//   WITH_RECOMPILE: 0x01,
//   NO_METADATA: 0x02,
//   REUSE_METADATA: 0x04
// };

const STATUS = {
  BY_REF_VALUE: 0x01,
  DEFAULT_VALUE: 0x02
};

/*
  s2.2.6.5
 */
module.exports = class RpcRequestPayload {
  constructor(request, txnDescriptor, options) {
    this.request = request;
    this.procedure = this.request.sqlTextOrProcedure;

    const buffer = new WritableTrackingBuffer(500);
    if (options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeAllHeaders(buffer, txnDescriptor, outstandingRequestCount);
    }

    if (typeof this.procedure === 'string') {
      buffer.writeUsVarchar(this.procedure);
    } else {
      buffer.writeUShort(0xFFFF);
      buffer.writeUShort(this.procedure);
    }

    const optionFlags = 0;
    buffer.writeUInt16LE(optionFlags);

    const parameters = this.request.parameters;
    for (let i = 0, len = parameters.length; i < len; i++) {
      const parameter = parameters[i];
      buffer.writeBVarchar('@' + parameter.name);

      let statusFlags = 0;
      if (parameter.output) {
        statusFlags |= STATUS.BY_REF_VALUE;
      }
      buffer.writeUInt8(statusFlags);

      const param = {
        value: parameter.value
      };

      const type = parameter.type;

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

  toString(indent) {
    indent || (indent = '');
    return indent + ('RPC Request - ' + this.procedure);
  }
};
