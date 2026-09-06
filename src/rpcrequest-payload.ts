import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import { type ResolvedParameter, writeRest } from './data-type';
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
   * whose value is read from a source while the request is written has the
   * rest of that write returned by `writeValue`, and is driven here so that
   * the buffer is handed on whenever the type says it is worth it.
   *
   * Chunks are yielded one by one rather than through `yield*`: an array
   * iterator has no `throw` method, so an error a consumer throws into this
   * generator during such a delegation would surface as a TypeError instead.
   */
  async *[Symbol.asyncIterator]() {
    const buffer = new WritableTrackingBuffer();
    this.writeHeader(buffer);

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      const parameter = this.parameters[i];
      this.writeParameterHeader(buffer, parameter);

      let rest: void | AsyncIterable<void>;
      try {
        parameter.type.writeTypeInfo(buffer, parameter.data, this.options);
        rest = parameter.type.writeValue(buffer, parameter.data, this.options);
      } catch (error) {
        throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
      }

      // A value read from a source while the request is written: the type
      // yields whenever the buffer is worth handing on.
      if (rest !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of writeRest(rest, (error) => new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error }))) {
          for (const chunk of buffer.getBuffers()) {
            yield chunk;
          }
          buffer.consume(buffer.length);
        }
      }

      if (buffer.length >= WritableTrackingBuffer.CHUNK_SIZE) {
        for (const chunk of buffer.getBuffers()) {
          yield chunk;
        }
        buffer.consume(buffer.length);
      }
    }

    for (const chunk of buffer.getBuffers()) {
      yield chunk;
    }
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
