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
  // Installed as an own property by the constructor only when a parameter is
  // streamed (not `declare`d like the fields below), so that `Readable.from`
  // picks the synchronous iterator when nothing is streamed.
  [Symbol.asyncIterator]?: () => AsyncGenerator<Buffer, void>;

  declare procedure: string | number;
  declare parameters: ResolvedParameter[];

  declare options: InternalConnectionOptions;
  declare txnDescriptor: Buffer;

  // Whether any parameter's value is streamed from a source read while the
  // request is written. When none is, the request is written synchronously
  // into one buffer (`[Symbol.iterator]`); when one is, the payload is an
  // async iterable instead (`[Symbol.asyncIterator]`, installed below), so
  // the non-streaming case keeps a fully synchronous fast path.
  declare streamed: boolean;

  constructor(procedure: string | number, parameters: ResolvedParameter[], txnDescriptor: Buffer, options: InternalConnectionOptions) {
    this.procedure = procedure;
    this.parameters = parameters;
    this.options = options;
    this.txnDescriptor = txnDescriptor;

    this.streamed = false;
    for (let i = 0, len = parameters.length; i < len; i++) {
      if (parameters[i].data.streamed) {
        this.streamed = true;
        this[Symbol.asyncIterator] = this.generateDataAsync;
        break;
      }
    }
  }

  [Symbol.iterator]() {
    return this.generateData();
  }

  * generateData() {
    // A streamed parameter must be written through the async path; the
    // constructor installs `[Symbol.asyncIterator]` so `Readable.from` uses
    // it. Guard against a caller iterating a streamed payload synchronously.
    if (this.streamed) {
      throw new Error('A payload with a streamed parameter must be iterated asynchronously.');
    }

    // The whole request is written into one buffer and its chunks are handed
    // out together: a large value written by reference stays by reference, so
    // this costs no extra copy, and the request reaches the packetizer as a
    // few large chunks rather than a small buffer per parameter.
    const buffer = new WritableTrackingBuffer();
    this.writeHeader(buffer);

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      this.writeParameterData(buffer, this.parameters[i]);
    }

    yield * buffer.getBuffers();
  }

  async * generateDataAsync() {
    const buffer = new WritableTrackingBuffer();
    this.writeHeader(buffer);

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      const parameter = this.parameters[i];

      if (!parameter.data.streamed) {
        this.writeParameterData(buffer, parameter);
        continue;
      }

      // Flush everything written so far, then let the type stream the value's
      // bytes (length prefix and data) from its source.
      this.writeParameterHeader(buffer, parameter);
      try {
        writeTypeInfo(parameter.type, buffer, parameter.data, this.options);
      } catch (error) {
        throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
      }

      yield * buffer.getBuffers();
      buffer.consume(buffer.length);

      try {
        yield * parameter.type.writeValueStream!(parameter.data, this.options);
      } catch (error) {
        throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
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

  writeParameterData(buffer: WritableTrackingBuffer, parameter: ResolvedParameter) {
    this.writeParameterHeader(buffer, parameter);

    try {
      writeTypeInfo(parameter.type, buffer, parameter.data, this.options);
      writeValue(parameter.type, buffer, parameter.data, this.options);
    } catch (error) {
      throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
    }
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
