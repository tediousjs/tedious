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
class RpcRequestPayload implements AsyncIterable<Buffer> {
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

  [Symbol.asyncIterator]() {
    return this.generateData();
  }

  // The whole request is written into one buffer and handed out in as few
  // chunks as possible: a request without streamed parameters is a single
  // buffer (with large values referenced rather than copied). A streamed
  // parameter's value is read from its source while it is written, so
  // everything written so far is handed out before it, and later parameters
  // are written into the emptied buffer after it.
  async * generateData() {
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

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      const parameter = this.parameters[i];
      const { type, data } = parameter;

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
        writeTypeInfo(type, buffer, data, this.options);

        if (!data.streamed) {
          writeValue(type, buffer, data, this.options);
          continue;
        }
      } catch (error) {
        throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
      }

      yield * buffer.getBuffers();
      buffer.consume(buffer.length);

      try {
        yield * type.writeValueStream!(data, this.options);
      } catch (error) {
        throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
      }
    }

    yield * buffer.getBuffers();
  }

  toString(indent = '') {
    return indent + ('RPC Request - ' + this.procedure);
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
