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

  /**
   * The request is written into one buffer whose contents are yielded once
   * it holds a chunk's worth (`WritableTrackingBuffer.CHUNK_SIZE`), checked
   * after every parameter, and at the end. A large value written by
   * reference stays by reference, so this costs no extra copy. A parameter
   * whose value is streamed (`data.streamed`) has its bytes yielded by the
   * type's `writeValueStream`, read from the value's source as it goes.
   */
  async *[Symbol.asyncIterator]() {
    const buffer = new WritableTrackingBuffer();
    this.writeHeader(buffer);

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      const parameter = this.parameters[i];
      this.writeParameterHeader(buffer, parameter);

      if (parameter.data.streamed) {
        try {
          writeTypeInfo(parameter.type, buffer, parameter.data, this.options);
        } catch (error) {
          throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
        }

        // Flush everything written so far, then let the type stream the
        // value's bytes (length prefix and data) from its source.
        yield * buffer.getBuffers();
        buffer.consume(buffer.length);

        try {
          yield * parameter.type.writeValueStream!(parameter.data, this.options);
        } catch (error) {
          throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
        }

        continue;
      }

      try {
        writeTypeInfo(parameter.type, buffer, parameter.data, this.options);
        writeValue(parameter.type, buffer, parameter.data, this.options);
      } catch (error) {
        throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
      }

      if (buffer.length >= WritableTrackingBuffer.CHUNK_SIZE) {
        yield * buffer.getBuffers();
        buffer.consume(buffer.length);
      }
    }

    yield * buffer.getBuffers();
  }

  toString(indent = '') {
    return indent + ('RPC Request - ' + this.procedure);
  }

  writeHeader(buffer: WritableTrackingBuffer) {
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
  }

  writeParameterHeader(buffer: WritableTrackingBuffer, parameter: ResolvedParameter) {
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
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
