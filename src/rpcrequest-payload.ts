import WritableTrackingBuffer, { CHUNK_SIZE } from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import { type Parameter, resolveParameter, writeTypeInfo, writeValue } from './data-type';
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
    // All data is written into a single sink, which coalesces small pieces
    // into chunks (every trip through the async iterator costs a promise
    // resolution, which would dominate the cost of small scalar parameters)
    // and passes large values through without copying them. Chunks are taken
    // out of the sink whenever a chunk's worth of data has been written, and
    // between the steps of values that are produced asynchronously (e.g.
    // streamed table-valued parameters).
    const sink = new WritableTrackingBuffer();

    if (this.options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeToTrackingBuffer(sink, this.txnDescriptor, outstandingRequestCount);
    }

    if (typeof this.procedure === 'string') {
      sink.writeUsVarchar(this.procedure, 'ucs2');
    } else {
      sink.writeUShort(0xFFFF);
      sink.writeUShort(this.procedure);
    }

    const optionFlags = 0;
    sink.writeUInt16LE(optionFlags);

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      const parameter = this.parameters[i];
      const steps = this.writeParameter(sink, parameter);

      if (steps !== undefined) {
        // Streamed values can only report errors while being sent.
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of steps) {
            if (sink.length >= CHUNK_SIZE) {
              yield * take(sink);
            }
          }
        } catch (error) {
          throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
        }
      }

      if (sink.length >= CHUNK_SIZE) {
        yield * take(sink);
      }
    }

    yield * take(sink);
  }

  toString(indent = '') {
    return indent + ('RPC Request - ' + this.procedure);
  }

  /**
   * Writes a single parameter into `sink`. If the parameter's value is
   * produced asynchronously, the async iterable driving it is returned.
   */
  writeParameter(sink: WritableTrackingBuffer, parameter: Parameter): AsyncIterable<void> | undefined {
    const name = parameter.name ? '@' + parameter.name : '';
    sink.writeUInt8(name.length);
    sink.append(name, 'ucs2');

    let statusFlags = 0;
    if (parameter.output) {
      statusFlags |= STATUS.BY_REF_VALUE;
    }
    sink.writeUInt8(statusFlags);

    const type = parameter.type;

    // Parameters are resolved (validated, with their declaration facts
    // determined) once, before the request is sent. Only the type's
    // serialization is wrapped, so that other errors are not misattributed.
    const resolved = parameter.resolved ?? resolveParameter(parameter, this.collation, this.options);

    try {
      writeTypeInfo(type, sink, resolved, this.options);
      return writeValue(type, sink, resolved, this.options) ?? undefined;
    } catch (error) {
      throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
    }
  }
}

/**
 * Takes all chunks out of the sink.
 */
function take(sink: WritableTrackingBuffer): Buffer[] {
  const buffers = sink.getBuffers();
  sink.consume(sink.length);
  return buffers;
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
