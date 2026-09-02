import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import { type Parameter, isAsyncIterable, resolveParameter, serializeTypeInfo, serializeValue } from './data-type';
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

// Buffers at least this large are passed through as-is instead of being
// copied into a coalesced chunk. Large values (e.g. a varbinary(max) holding
// a file) therefore cost no extra memory, while the many small pieces that
// make up scalar parameters are still sent as a single chunk.
const COALESCE_LIMIT = 8 * 1024;

/**
 * Collects the pieces of a request. Small pieces are coalesced into a chunk
 * of at most `COALESCE_LIMIT` bytes; larger pieces are passed through without
 * being copied.
 */
class ChunkQueue {
  declare ready: Buffer[];
  declare pending: Buffer[];
  declare pendingLength: number;

  constructor() {
    this.ready = [];
    this.pending = [];
    this.pendingLength = 0;
  }

  push(buffer: Buffer) {
    if (buffer.length >= COALESCE_LIMIT) {
      this.flush();
      this.ready.push(buffer);
      return;
    }

    this.pending.push(buffer);
    this.pendingLength += buffer.length;

    if (this.pendingLength >= COALESCE_LIMIT) {
      this.flush();
    }
  }

  flush() {
    const pending = this.pending;
    if (pending.length === 1) {
      this.ready.push(pending[0]);
    } else if (pending.length > 1) {
      this.ready.push(Buffer.concat(pending, this.pendingLength));
    }
    this.pending = [];
    this.pendingLength = 0;
  }

  /**
   * Returns the chunks that are ready to be sent, without flushing the
   * pieces that are still being coalesced.
   */
  take(): Buffer[] {
    const ready = this.ready;
    this.ready = [];
    return ready;
  }
}

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

    // Synchronously available data is coalesced into as few chunks as
    // possible: every trip through the async iterator costs a promise
    // resolution, which dominates the cost of small scalar parameters.
    // Large pieces are passed through without being copied, and values that
    // are produced asynchronously (e.g. streamed table-valued parameters)
    // are yielded as they arrive.
    const queue = new ChunkQueue();
    queue.push(buffer.data);

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      const parameter = this.parameters[i];
      const value = this.generateParameterData(parameter, queue);

      if (value !== undefined) {
        queue.flush();
      }

      if (queue.ready.length) {
        yield * queue.take();
      }

      if (value !== undefined) {
        // Streamed values can only report errors while being sent.
        try {
          yield * value;
        } catch (error) {
          throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
        }
      }
    }

    queue.flush();
    yield * queue.take();
  }

  toString(indent = '') {
    return indent + ('RPC Request - ' + this.procedure);
  }

  /**
   * Serializes a single parameter. Synchronously available data is pushed
   * onto `queue`; if the parameter's value is produced asynchronously, the
   * async iterable is returned so that the caller can stream it.
   */
  generateParameterData(parameter: Parameter, queue: ChunkQueue): AsyncIterable<Buffer> | undefined {
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

    queue.push(buffer.data);

    const type = parameter.type;

    // Parameters are resolved (validated, with their declaration facts
    // determined) once, before the request is sent. Only the type's
    // serialization is wrapped, so that other errors are not misattributed.
    const resolved = parameter.resolved ?? resolveParameter(parameter, this.collation, this.options);

    let value;
    try {
      queue.push(serializeTypeInfo(type, resolved, this.options));
      value = serializeValue(type, resolved, this.options);
    } catch (error) {
      throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
    }

    if (isAsyncIterable(value)) {
      return value;
    }

    // Legacy `generateParameterData` implementations are generators that
    // only run (and validate) when iterated, so draining them is wrapped too.
    try {
      for (const chunk of value) {
        queue.push(chunk);
      }
    } catch (error) {
      throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
    }

    return undefined;
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
