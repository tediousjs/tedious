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
    // Only values that are actually produced asynchronously (e.g. streamed
    // table-valued parameters) are yielded as they arrive.
    let pending: Buffer[] = [buffer.data];

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      const parameter = this.parameters[i];
      const value = this.generateParameterData(parameter, pending);

      if (value !== undefined) {
        yield Buffer.concat(pending);
        pending = [];

        // Streamed values can only report errors while being sent.
        try {
          yield * value;
        } catch (error) {
          throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
        }
      }
    }

    if (pending.length) {
      yield pending.length === 1 ? pending[0] : Buffer.concat(pending);
    }
  }

  toString(indent = '') {
    return indent + ('RPC Request - ' + this.procedure);
  }

  /**
   * Serializes a single parameter. Synchronously available data is pushed
   * onto `pending`; if the parameter's value is produced asynchronously, the
   * async iterable is returned so that the caller can stream it.
   */
  generateParameterData(parameter: Parameter, pending: Buffer[]): AsyncIterable<Buffer> | undefined {
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

    pending.push(buffer.data);

    const type = parameter.type;

    // Parameters are resolved (validated, with their declaration facts
    // determined) once, before the request is sent. Only the type's
    // serialization is wrapped, so that other errors are not misattributed.
    const resolved = parameter.resolved ?? resolveParameter(parameter, this.collation, this.options);

    let value;
    try {
      pending.push(serializeTypeInfo(type, resolved, this.options));
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
        pending.push(chunk);
      }
    } catch (error) {
      throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
    }

    return undefined;
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
