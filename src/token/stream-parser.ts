import Debug from '../debug';
import { type InternalConnectionOptions } from '../connection';

import { TYPE, ColMetadataToken, DoneProcToken, DoneToken, DoneInProcToken, ErrorMessageToken, InfoMessageToken, RowToken, type EnvChangeToken, LoginAckToken, ReturnStatusToken, OrderToken, FedAuthInfoToken, SSPIToken, ReturnValueToken, NBCRowToken, FeatureExtAckToken, Token } from './token';

import colMetadataParser, { type ColumnMetadata } from './colmetadata-token-parser';
import { doneParser, doneInProcParser, doneProcParser } from './done-token-parser';
import envChangeParser from './env-change-token-parser';
import { errorParser, infoParser } from './infoerror-token-parser';
import fedAuthInfoParser from './fedauth-info-parser';
import featureExtAckParser from './feature-ext-ack-parser';
import loginAckParser from './loginack-token-parser';
import orderParser from './order-token-parser';
import returnStatusParser from './returnstatus-token-parser';
import returnValueParser from './returnvalue-token-parser';
import rowParser from './row-token-parser';
import nbcRowParser from './nbcrow-token-parser';
import sspiParser from './sspi-token-parser';
import { NotEnoughDataError } from './helpers';

export type ParserOptions = Pick<InternalConnectionOptions, 'useUTC' | 'lowerCaseGuids' | 'tdsVersion' | 'useColumnNames' | 'columnNameReplacer' | 'camelCaseColumns'> & Pick<Partial<InternalConnectionOptions>, 'rowFormat'>;

const INITIAL_BUFFER_SIZE = 8 * 1024;

class Parser {
  debug: Debug;
  colMetadata: ColumnMetadata[];
  options: ParserOptions;

  iterator: AsyncIterator<Buffer, any, undefined> | Iterator<Buffer, any, undefined>;

  /**
   * The underlying storage of the parse buffer. Reused across refills;
   * `buffer` is a view of the filled part of this storage.
   */
  storage: Buffer;
  buffer: Buffer;
  position: number;

  static async *parseTokens(iterable: AsyncIterable<Buffer> | Iterable<Buffer>, debug: Debug, options: ParserOptions, colMetadata: ColumnMetadata[] = []) {
    const parser = new Parser(iterable, debug, options);
    parser.colMetadata = colMetadata;

    while (true) {
      try {
        await parser.waitForChunk();
      } catch (err: unknown) {
        if (parser.position === parser.buffer.length) {
          return;
        }

        throw err;
      }

      while (parser.buffer.length >= parser.position + 1) {
        const type = parser.buffer.readUInt8(parser.position);
        parser.position += 1;

        const token = parser.readToken(type);
        if (token !== undefined) {
          yield token;
        }
      }
    }
  }

  readToken(type: number): Token | undefined | Promise<Token | undefined> {
    switch (type) {
      case TYPE.DONE: {
        return this.readDoneToken();
      }

      case TYPE.DONEPROC: {
        return this.readDoneProcToken();
      }

      case TYPE.DONEINPROC: {
        return this.readDoneInProcToken();
      }

      case TYPE.ERROR: {
        return this.readErrorToken();
      }

      case TYPE.INFO: {
        return this.readInfoToken();
      }

      case TYPE.ENVCHANGE: {
        return this.readEnvChangeToken();
      }

      case TYPE.LOGINACK: {
        return this.readLoginAckToken();
      }

      case TYPE.RETURNSTATUS: {
        return this.readReturnStatusToken();
      }

      case TYPE.ORDER: {
        return this.readOrderToken();
      }

      case TYPE.FEDAUTHINFO: {
        return this.readFedAuthInfoToken();
      }

      case TYPE.SSPI: {
        return this.readSSPIToken();
      }

      case TYPE.COLMETADATA: {
        return this.readColMetadataToken();
      }

      case TYPE.RETURNVALUE: {
        return this.readReturnValueToken();
      }

      case TYPE.ROW: {
        return this.readRowToken();
      }

      case TYPE.NBCROW: {
        return this.readNbcRowToken();
      }

      case TYPE.FEATUREEXTACK: {
        return this.readFeatureExtAckToken();
      }

      default: {
        throw new Error('Unknown type: ' + type);
      }
    }
  }

  readFeatureExtAckToken(): FeatureExtAckToken | Promise<FeatureExtAckToken> {
    let result;

    try {
      result = featureExtAckParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readFeatureExtAckToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readNbcRowToken(): NBCRowToken | Promise<NBCRowToken> {
    const row = nbcRowParser(this);
    if (row instanceof Promise) {
      return row.then((row) => new NBCRowToken(row));
    }

    return new NBCRowToken(row);
  }

  async readReturnValueToken(): Promise<ReturnValueToken> {
    return await returnValueParser(this);
  }

  async readColMetadataToken(): Promise<ColMetadataToken> {
    const token = await colMetadataParser(this);
    this.colMetadata = token.columns;
    return token;
  }

  readSSPIToken(): SSPIToken | Promise<SSPIToken> {
    let result;

    try {
      result = sspiParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readSSPIToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readFedAuthInfoToken(): FedAuthInfoToken | Promise<FedAuthInfoToken> {
    let result;

    try {
      result = fedAuthInfoParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readFedAuthInfoToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readOrderToken(): OrderToken | Promise<OrderToken> {
    let result;

    try {
      result = orderParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readOrderToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readReturnStatusToken(): ReturnStatusToken | Promise<ReturnStatusToken> {
    let result;

    try {
      result = returnStatusParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readReturnStatusToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readLoginAckToken(): LoginAckToken | Promise<LoginAckToken> {
    let result;

    try {
      result = loginAckParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readLoginAckToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readEnvChangeToken(): EnvChangeToken | undefined | Promise<EnvChangeToken | undefined> {
    let result;

    try {
      result = envChangeParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readEnvChangeToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readRowToken(): RowToken | Promise<RowToken> {
    const row = rowParser(this);
    if (row instanceof Promise) {
      return row.then((row) => new RowToken(row));
    }

    return new RowToken(row);
  }

  readInfoToken(): InfoMessageToken | Promise<InfoMessageToken> {
    let result;

    try {
      result = infoParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readInfoToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readErrorToken(): ErrorMessageToken | Promise<ErrorMessageToken> {
    let result;

    try {
      result = errorParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readErrorToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readDoneInProcToken(): DoneInProcToken | Promise<DoneInProcToken> {
    let result;

    try {
      result = doneInProcParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readDoneInProcToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readDoneProcToken(): DoneProcToken | Promise<DoneProcToken> {
    let result;

    try {
      result = doneProcParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readDoneProcToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  readDoneToken(): DoneToken | Promise<DoneToken> {
    let result;

    try {
      result = doneParser(this.buffer, this.position, this.options);
    } catch (err: any) {
      if (err instanceof NotEnoughDataError) {
        return this.waitForChunk().then(() => {
          return this.readDoneToken();
        });
      }

      throw err;
    }

    this.position = result.offset;
    return result.value;
  }

  constructor(iterable: AsyncIterable<Buffer> | Iterable<Buffer>, debug: Debug, options: ParserOptions) {
    this.debug = debug;
    this.colMetadata = [];
    this.options = options;

    this.iterator = ((iterable as AsyncIterable<Buffer>)[Symbol.asyncIterator] || (iterable as Iterable<Buffer>)[Symbol.iterator]).call(iterable);

    this.storage = Buffer.allocUnsafe(INITIAL_BUFFER_SIZE);
    this.buffer = this.storage.subarray(0, 0);
    this.position = 0;
  }

  async waitForChunk() {
    const result = await this.iterator.next();
    if (result.done) {
      throw new Error('unexpected end of data');
    }

    this.append(result.value);
  }

  /**
   * Appends a chunk of incoming data to the parse buffer, reusing the
   * existing storage whenever possible.
   *
   * When the previous data was fully consumed, the chunk is adopted as the
   * parse buffer directly, without copying. Otherwise, the unconsumed
   * remainder and the chunk are merged into the (reused) storage. This
   * invalidates views into the parse buffer, so any data that needs to
   * outlive the current parse step (values handed out to user code, token
   * fields, PLP chunks collected across refills) must be copied out of the
   * buffer, and parsing must restart from `position` after every refill.
   */
  append(chunk: Buffer) {
    const dataEnd = this.buffer.length;

    if (this.position === dataEnd) {
      // The previous data was fully consumed - adopt the chunk directly.
      this.buffer = chunk;
      this.position = 0;
      return;
    }

    const remaining = dataEnd - this.position;
    const needed = remaining + chunk.length;

    // The parse buffer is either a view of `storage` (starting at offset 0)
    // or an adopted chunk.
    const storageBacked = this.buffer.buffer === this.storage.buffer;

    if (storageBacked && dataEnd + chunk.length <= this.storage.length) {
      // The chunk fits into the remaining storage space.
      chunk.copy(this.storage, dataEnd);
      this.buffer = this.storage.subarray(0, dataEnd + chunk.length);
      return;
    }

    if (needed > this.storage.length) {
      // Grow the storage. `allocUnsafe` is fine here as `buffer` only ever
      // exposes the bytes that were copied in.
      let size = this.storage.length * 2;
      while (size < needed) {
        size *= 2;
      }

      this.storage = Buffer.allocUnsafe(size);
      this.buffer.copy(this.storage, 0, this.position, dataEnd);
    } else if (storageBacked) {
      // Reclaim the consumed space at the start of the storage.
      this.storage.copyWithin(0, this.position, dataEnd);
    } else {
      // Move the remainder of an adopted chunk into the storage.
      this.buffer.copy(this.storage, 0, this.position, dataEnd);
    }

    chunk.copy(this.storage, remaining);
    this.buffer = this.storage.subarray(0, needed);
    this.position = 0;
  }
}

export default Parser;
module.exports = Parser;
