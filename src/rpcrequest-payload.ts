import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import { type ResolvedParameter, writeTypeInfo, writeValue } from './data-type';
import { type InternalConnectionOptions } from './connection';
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
 */
class RpcRequestPayload implements Iterable<Buffer> {
  declare procedure: string | number;
  declare parameters: ResolvedParameter[];

  declare options: InternalConnectionOptions;
  declare txnDescriptor: Buffer;

  constructor(procedure: string | number, parameters: ResolvedParameter[], txnDescriptor: Buffer, options: InternalConnectionOptions) {
    this.procedure = procedure;
    this.parameters = parameters;
    this.options = options;
    this.txnDescriptor = txnDescriptor;
  }

  [Symbol.iterator]() {
    return this.generateData();
  }

  * generateData() {
    const buffer = new WritableTrackingBuffer();
    if (this.options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeToTrackingBuffer(buffer, this.txnDescriptor, outstandingRequestCount);
    }

    if (typeof this.procedure === 'string') {
      buffer.writeUsVarchar(this.procedure, 'ucs2');
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

  * generateParameterData(parameter: ResolvedParameter) {
    const buffer = new WritableTrackingBuffer();

    if (parameter.name) {
      buffer.writeBVarchar('@' + parameter.name, 'ucs2');
    } else {
      buffer.writeBVarchar('', 'ucs2');
    }

    let statusFlags = 0;
    if (parameter.output) {
      statusFlags |= STATUS.BY_REF_VALUE;
    }
    buffer.writeUInt8(statusFlags);

    try {
      writeTypeInfo(parameter.type, buffer, parameter.data, this.options);
      writeValue(parameter.type, buffer, parameter.data, this.options);
    } catch (error) {
      throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
    }

    // Large values are referenced by the buffer rather than copied; handing
    // out its chunks keeps them that way.
    yield * buffer.getBuffers();
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
