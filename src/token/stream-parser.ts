import Debug from '../debug';
import { type InternalConnectionOptions } from '../connection';

import { TYPE, ColMetadataToken, Token } from './token';

import colInfoParser from './colinfo-token-parser';
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
import rowParser, { type RowState } from './row-token-parser';
import { type ReturnValueState } from './returnvalue-token-parser';
import nbcRowParser from './nbcrow-token-parser';
import sspiParser from './sspi-token-parser';
import tabNameParser from './tabname-token-parser';
import { NotEnoughDataError, type Result } from './helpers';

export type ParserOptions = Pick<InternalConnectionOptions, 'useUTC' | 'lowerCaseGuids' | 'tdsVersion' | 'useColumnNames' | 'columnNameReplacer' | 'camelCaseColumns'>;

/**
 * Returned by `parseNext` when the buffered data does not hold a complete
 * token yet.
 */
export const NEED_MORE_DATA: unique symbol = Symbol('NEED_MORE_DATA');

const EMPTY = Buffer.alloc(0);

/**
 * A push based parser for the tokens of a TDS message.
 *
 * Data is added via `push`, and `parseNext` is called repeatedly to parse
 * one token at a time from the buffered data. A token that is not
 * completely available yet is retried once more data has been pushed:
 * the readers throw `NotEnoughDataError`, the parser rewinds to the last
 * committed position and remembers how much data the reader asked for,
 * so it will not try again before that much data has been buffered.
 *
 * Readers of tokens that can be large (rows) commit their progress via
 * `commit` and keep their state on the parser (`tokenState`), so that a
 * row spanning many packets is not parsed from the start again for each
 * packet.
 */
class Parser {
  debug: Debug;
  colMetadata: ColumnMetadata[];
  options: ParserOptions;

  /**
   * The buffered, not yet consumed data.
   */
  buffer: Buffer;
  /**
   * The current read position in `buffer`.
   */
  position: number;
  /**
   * The position to rewind to when the current token cannot be completed
   * with the buffered data.
   */
  committed: number;
  /**
   * The buffer length needed before the current token is worth another
   * attempt, or `0`.
   */
  needed: number;
  /**
   * The type of the token being parsed when it could not be completed, so
   * that parsing resumes with the same reader.
   */
  pendingType: number | undefined;

  /**
   * The progress of a partially parsed token whose reader resumes rather
   * than restarts (rows, NBC rows and return values).
   */
  tokenState: RowState | ReturnValueState | undefined;

  constructor(debug: Debug, options: ParserOptions) {
    this.debug = debug;
    this.colMetadata = [];
    this.options = options;

    this.buffer = EMPTY;
    this.position = 0;
    this.committed = 0;
    this.needed = 0;
    this.pendingType = undefined;
    this.tokenState = undefined;
  }

  /**
   * Adds data to the parser.
   */
  push(chunk: Buffer) {
    if (this.committed === this.buffer.length) {
      this.buffer = chunk;
    } else if (this.committed === 0) {
      this.buffer = Buffer.concat([this.buffer, chunk]);
    } else {
      this.buffer = Buffer.concat([this.buffer.subarray(this.committed), chunk]);
    }

    if (this.needed > 0) {
      this.needed -= this.committed;
    }

    this.position = 0;
    this.committed = 0;
  }

  /**
   * Whether all pushed data has been consumed.
   */
  isEmpty() {
    return this.pendingType === undefined && this.committed === this.buffer.length;
  }

  /**
   * Marks the current position as consumed: if the current token cannot be
   * completed, parsing later resumes from here rather than from the start
   * of the token.
   */
  commit() {
    this.committed = this.position;
  }

  /**
   * Parses the next token from the buffered data.
   *
   * Returns the token, `undefined` for tokens that do not produce a value,
   * or `NEED_MORE_DATA` if the buffered data does not hold a complete token.
   */
  parseNext(): Token | undefined | typeof NEED_MORE_DATA {
    if (this.buffer.length < this.needed) {
      return NEED_MORE_DATA;
    }
    this.needed = 0;

    let type = this.pendingType;
    if (type === undefined) {
      if (this.position >= this.buffer.length) {
        return NEED_MORE_DATA;
      }

      type = this.buffer[this.position];
      this.position += 1;
      this.committed = this.position;
      this.pendingType = type;
    }

    let token;
    try {
      token = this.readToken(type);
    } catch (err) {
      if (err instanceof NotEnoughDataError) {
        this.needed = err.byteCount;
        this.position = this.committed;
        return NEED_MORE_DATA;
      }

      throw err;
    }

    this.pendingType = undefined;
    this.committed = this.position;
    return token;
  }

  /**
   * Parses all tokens of a complete message, in one go. Meant for tests.
   */
  static async *parseTokens(iterable: AsyncIterable<Buffer> | Iterable<Buffer>, debug: Debug, options: ParserOptions, colMetadata: ColumnMetadata[] = []): AsyncGenerator<Token, void, unknown> {
    const parser = new Parser(debug, options);
    parser.colMetadata = colMetadata;

    for await (const chunk of iterable) {
      parser.push(chunk);

      while (true) {
        const token = parser.parseNext();
        if (token === NEED_MORE_DATA) {
          break;
        }

        if (token !== undefined) {
          yield token;
        }
      }
    }

    if (!parser.isEmpty()) {
      throw new Error('unexpected end of data');
    }
  }

  readToken(type: number): Token | undefined {
    switch (type) {
      case TYPE.DONE: {
        return this.readSimpleToken(doneParser);
      }

      case TYPE.DONEPROC: {
        return this.readSimpleToken(doneProcParser);
      }

      case TYPE.DONEINPROC: {
        return this.readSimpleToken(doneInProcParser);
      }

      case TYPE.ERROR: {
        return this.readSimpleToken(errorParser);
      }

      case TYPE.INFO: {
        return this.readSimpleToken(infoParser);
      }

      case TYPE.ENVCHANGE: {
        return this.readSimpleToken(envChangeParser);
      }

      case TYPE.LOGINACK: {
        return this.readSimpleToken(loginAckParser);
      }

      case TYPE.RETURNSTATUS: {
        return this.readSimpleToken(returnStatusParser);
      }

      case TYPE.ORDER: {
        return this.readSimpleToken(orderParser);
      }

      case TYPE.FEDAUTHINFO: {
        return this.readSimpleToken(fedAuthInfoParser);
      }

      case TYPE.SSPI: {
        return this.readSimpleToken(sspiParser);
      }

      case TYPE.COLMETADATA: {
        return this.readColMetadataToken();
      }

      case TYPE.RETURNVALUE: {
        return returnValueParser(this);
      }

      case TYPE.ROW: {
        return rowParser(this);
      }

      case TYPE.NBCROW: {
        return nbcRowParser(this);
      }

      case TYPE.FEATUREEXTACK: {
        return this.readSimpleToken(featureExtAckParser);
      }

      case TYPE.TABNAME: {
        return this.readSimpleToken(tabNameParser);
      }

      case TYPE.COLINFO: {
        return this.readSimpleToken(colInfoParser);
      }

      default: {
        throw new Error('Unknown type: ' + type);
      }
    }
  }

  /**
   * Reads a token whose parser works on a buffer and offset, and which is
   * retried from the start of the token if it is not complete yet.
   */
  readSimpleToken<T>(parse: (buffer: Buffer, offset: number, options: ParserOptions) => Result<T>): T {
    const result = parse(this.buffer, this.position, this.options);
    this.position = result.offset;
    return result.value;
  }

  readColMetadataToken(): ColMetadataToken {
    const token = colMetadataParser(this);
    this.colMetadata = token.columns;
    return token;
  }
}

export default Parser;
module.exports = Parser;
module.exports.NEED_MORE_DATA = NEED_MORE_DATA;
