import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import { type Parameter, type ParameterData } from './data-type';
import { type InternalConnectionOptions } from './connection';
import { Collation } from './collation';
import { InputError } from './errors';

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

  SPIKE: the payload is an *async* iterable, so that parameter data can be
  pulled lazily from asynchronous sources (e.g. table-valued parameters whose
  rows come from a stream). Backpressure propagates from the socket through
  `Readable.from` back to the row source.
 */
class RpcRequestPayload implements AsyncIterable<Buffer> {
  declare procedure: string | number;
  declare parameters: Parameter[];

  declare options: InternalConnectionOptions;
  declare txnDescriptor: Buffer;
  declare collation: Collation | undefined;

  constructor(procedure: string | number, parameters: Parameter[], txnDescriptor: Buffer, options: InternalConnectionOptions, collation: Collation | undefined) {
    this.procedure = procedure;
    this.parameters = parameters;
    this.options = options;
    this.txnDescriptor = txnDescriptor;
    this.collation = collation;
  }

  [Symbol.asyncIterator]() {
    return this.generateData();
  }

  async * generateData() {
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

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      yield * this.generateParameterData(this.parameters[i]);
    }
  }

  toString(indent = '') {
    return indent + ('RPC Request - ' + this.procedure);
  }

  async * generateParameterData(parameter: Parameter) {
    const buffer = new WritableTrackingBuffer(1 + 2 + Buffer.byteLength(parameter.name, 'ucs-2') + 1);

    if (parameter.name) {
      buffer.writeBVarchar('@' + parameter.name);
    } else {
      buffer.writeBVarchar('');
    }

    let statusFlags = 0;
    if (parameter.output) {
      statusFlags |= STATUS.BY_REF_VALUE;
    }
    buffer.writeUInt8(statusFlags);

    yield buffer.data;

    const param: ParameterData = { value: parameter.value };

    const type = parameter.type;

    if (parameter.length) {
      param.length = parameter.length;
    } else if (type.resolveLength) {
      param.length = type.resolveLength(parameter);
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

    if (this.collation) {
      param.collation = this.collation;
    }

    yield type.generateTypeInfo(param, this.options);
    yield type.generateParameterLength(param, this.options);
    try {
      // Works for both synchronous and asynchronous generators.
      yield * type.generateParameterData(param, this.options);
    } catch (error) {
      throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
    }
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
