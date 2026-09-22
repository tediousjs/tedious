import { type InternalConnectionOptions } from '../connection';

import { TYPE, type Token } from './token';

import colInfoParser from './colinfo-token-parser';
import { ColMetadataTokenReader, type ColumnMetadata } from './colmetadata-token-parser';
import { doneParser, doneInProcParser, doneProcParser } from './done-token-parser';
import envChangeParser from './env-change-token-parser';
import { errorParser, infoParser } from './infoerror-token-parser';
import fedAuthInfoParser from './fedauth-info-parser';
import featureExtAckParser from './feature-ext-ack-parser';
import loginAckParser from './loginack-token-parser';
import orderParser from './order-token-parser';
import returnStatusParser from './returnstatus-token-parser';
import { ReturnValueTokenReader } from './returnvalue-token-parser';
import { RowTokenReader } from './row-token-parser';
import { NBCRowTokenReader } from './nbcrow-token-parser';
import sspiParser from './sspi-token-parser';
import tabNameParser from './tabname-token-parser';
import { NotEnoughDataError, type Result } from './helpers';

export type ParserOptions = Pick<InternalConnectionOptions, 'useUTC' | 'lowerCaseGuids' | 'tdsVersion' | 'useColumnNames' | 'columnNameReplacer' | 'camelCaseColumns'>;

/**
 * Parses a token that is short enough to simply be parsed again from its
 * start if it is not fully available yet.
 */
type TokenParser = (buf: Buffer, offset: number, options: ParserOptions) => Result<Token | undefined>;

/**
 * Parses a token that can grow arbitrarily large, and thus needs to be parsed
 * incrementally.
 *
 * The reader starts parsing right after the token's type byte and keeps its
 * progress across calls: if `read` throws a `NotEnoughDataError`, it is
 * called again once more data has arrived.
 */
export interface TokenReader {
  read(parser: Parser): Token;
}

/**
 * A push-based parser for the tokens contained in a TDS token stream.
 *
 * Data is pushed into the parser as it arrives via `write`, and parsed tokens
 * are pulled out via `read`. Tokens are parsed lazily, one at a time, so any
 * effects of handling a token (e.g. the TDS version negotiated via the
 * `LOGINACK` token) apply to the parsing of all tokens that follow it.
 */
class Parser {
  declare options: ParserOptions;
  declare colMetadata: ColumnMetadata[];

  // The data that is currently being parsed, and the position of the first
  // byte in it that has not been consumed yet.
  declare buffer: Buffer;
  declare position: number;

  // Chunks that were written, but not yet appended to `buffer`.
  declare pending: Buffer[];
  declare pendingLength: number;

  // The number of unconsumed bytes required for parsing to make progress.
  //
  // Incomplete data is not appended to `buffer` until at least this many
  // bytes are available, so that a large token arriving across many chunks is
  // not parsed again (and copied again) for every chunk.
  declare bytesNeeded: number;

  // The reader of an incrementally parsed token that is not complete yet.
  declare tokenReader: TokenReader | undefined;

  constructor(options: ParserOptions, colMetadata: ColumnMetadata[] = []) {
    this.options = options;
    this.colMetadata = colMetadata;

    this.buffer = Buffer.alloc(0);
    this.position = 0;

    this.pending = [];
    this.pendingLength = 0;

    this.bytesNeeded = 1;
    this.tokenReader = undefined;
  }

  /**
   * Parse all tokens from the given chunks of data.
   */
  static async *parseTokens(iterable: AsyncIterable<Buffer> | Iterable<Buffer>, options: ParserOptions, colMetadata?: ColumnMetadata[]): AsyncGenerator<Token, void, undefined> {
    const parser = new Parser(options, colMetadata);

    for await (const chunk of iterable) {
      parser.write(chunk);

      let token;
      while ((token = parser.read()) !== undefined) {
        yield token;
      }
    }

    parser.end();
  }

  /**
   * Add a chunk of data to be parsed.
   */
  write(chunk: Buffer) {
    this.pending.push(chunk);
    this.pendingLength += chunk.length;
  }

  /**
   * Parse the next token, or return `undefined` if more data needs to be
   * written first.
   */
  read(): Token | undefined {
    while (true) {
      if (this.buffer.length - this.position < this.bytesNeeded && !this.appendPending()) {
        return undefined;
      }

      let token;
      try {
        token = this.tokenReader !== undefined ? this.tokenReader.read(this) : this.readToken();
      } catch (err) {
        if (err instanceof NotEnoughDataError) {
          // Always wait for at least one more byte, so parsing never retries
          // without new data.
          this.bytesNeeded = Math.max(err.byteCount, this.buffer.length + 1) - this.position;
          continue;
        }

        throw err;
      }

      this.tokenReader = undefined;
      this.bytesNeeded = 1;

      // Some tokens (e.g. unknown `ENVCHANGE` types) are skipped.
      if (token !== undefined) {
        return token;
      }
    }
  }

  /**
   * Signal that all data was written.
   *
   * Throws if the data ended in the middle of a token.
   */
  end() {
    if (this.tokenReader !== undefined || this.position < this.buffer.length || this.pendingLength > 0) {
      throw new Error('unexpected end of data');
    }
  }

  /**
   * Append the pending chunks to the unconsumed data, if that makes enough
   * data available for parsing to make progress.
   */
  appendPending(): boolean {
    const remaining = this.buffer.length - this.position;
    if (remaining + this.pendingLength < this.bytesNeeded) {
      return false;
    }

    if (remaining === 0 && this.pending.length === 1) {
      this.buffer = this.pending[0];
    } else {
      this.pending.unshift(this.buffer.subarray(this.position));
      this.buffer = Buffer.concat(this.pending, remaining + this.pendingLength);
    }

    this.position = 0;
    this.pending = [];
    this.pendingLength = 0;

    return true;
  }

  readToken(): Token | undefined {
    const type = this.buffer[this.position];

    switch (type) {
      case TYPE.DONE:
        return this.parseToken(doneParser);

      case TYPE.DONEPROC:
        return this.parseToken(doneProcParser);

      case TYPE.DONEINPROC:
        return this.parseToken(doneInProcParser);

      case TYPE.ERROR:
        return this.parseToken(errorParser);

      case TYPE.INFO:
        return this.parseToken(infoParser);

      case TYPE.ENVCHANGE:
        return this.parseToken(envChangeParser);

      case TYPE.LOGINACK:
        return this.parseToken(loginAckParser);

      case TYPE.RETURNSTATUS:
        return this.parseToken(returnStatusParser);

      case TYPE.ORDER:
        return this.parseToken(orderParser);

      case TYPE.FEDAUTHINFO:
        return this.parseToken(fedAuthInfoParser);

      case TYPE.SSPI:
        return this.parseToken(sspiParser);

      case TYPE.FEATUREEXTACK:
        return this.parseToken(featureExtAckParser);

      case TYPE.TABNAME:
        return this.parseToken(tabNameParser);

      case TYPE.COLINFO:
        return this.parseToken(colInfoParser);

      case TYPE.COLMETADATA:
        return this.startTokenReader(new ColMetadataTokenReader());

      case TYPE.RETURNVALUE:
        return this.startTokenReader(new ReturnValueTokenReader());

      case TYPE.ROW:
        return this.startTokenReader(new RowTokenReader());

      case TYPE.NBCROW:
        return this.startTokenReader(new NBCRowTokenReader());

      default:
        throw new Error('Unknown type: ' + type);
    }
  }

  parseToken(parser: TokenParser): Token | undefined {
    const result = parser(this.buffer, this.position + 1, this.options);
    this.position = result.offset;
    return result.value;
  }

  startTokenReader(reader: TokenReader): Token {
    this.position += 1;
    this.tokenReader = reader;
    return reader.read(this);
  }
}

export default Parser;
module.exports = Parser;
