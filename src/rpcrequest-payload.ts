import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import Request from './request';
import { Parameter, ParameterData } from './data-type';
import { InternalConnectionOptions } from './connection';

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
class RpcRequestPayload implements Iterable<Buffer> {
  request: Request;
  procedure: string | number;

  options: InternalConnectionOptions;
  txnDescriptor: Buffer;

  constructor(request: Request, txnDescriptor: Buffer, options: InternalConnectionOptions) {
    this.request = request;
    this.procedure = this.request.sqlTextOrProcedure!;
    this.options = options;
    this.txnDescriptor = txnDescriptor;
  }

  [Symbol.iterator]() {
    return this.generateData();
  }

  * generateData() {
    const buffer = new WritableTrackingBuffer(500);
    if (this.options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeToTrackingBuffer(buffer, this.txnDescriptor, outstandingRequestCount);
    }

    if (typeof this.procedure === 'string') {
      buffer.writeUsVarchar(this.procedure);
    } else {
      buffer.writeUShort(0xFFFF);
      buffer.writeUShort(this.procedure);
    }

    const optionFlags = 0;
    buffer.writeUInt16LE(optionFlags);
    yield buffer.data;

    const parameters = this.request.parameters;
    for (let i = 0; i < parameters.length; i++) {
      yield* this.generateParameterData(parameters[i], this.options);
    }
  }

  toString(indent = '') {
    return indent + ('RPC Request - ' + this.procedure);
  }

  * generateParameterData(parameter: Parameter, options: any) {
    const buffer = new WritableTrackingBuffer(1 + 2 + Buffer.byteLength(parameter.name, 'ucs-2') + 1);
    buffer.writeBVarchar('@' + parameter.name);

    let statusFlags = 0;
    if (parameter.output) {
      statusFlags |= STATUS.BY_REF_VALUE;
    }
    buffer.writeUInt8(statusFlags);

    yield buffer.data;

    const param: ParameterData = { value: parameter.value };

    const type = parameter.type;

    if ((type.id & 0x30) === 0x20) {
      if (parameter.length) {
        param.length = parameter.length;
      } else if (type.resolveLength) {
        param.length = type.resolveLength(parameter);
      }
    }

    if (parameter.precision) {
      param.precision = parameter.precision;
    } else if (type.resolvePrecision) {
      param.precision = type.resolvePrecision(parameter);
    }

    if (parameter.scale) {
      param.scale = parameter.scale;
    } else if (type.resolveScale) {
      param.scale = type.resolveScale(parameter);
    }

    yield type.generateTypeInfo(param, this.options);
    yield* type.generateParameterData(param, options);
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
