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

export type ParserOptions = Pick<InternalConnectionOptions, 'useUTC' | 'lowerCaseGuids' | 'tdsVersion' | 'useColumnNames' | 'columnNameReplacer' | 'camelCaseColumns' | 'alwaysEncrypted' | 'trustedServerNameAE' | 'encryptionKeyStoreProviders' | 'columnEncryptionKeyCacheTTL'> & {
  /**
   * Whether the server supports column encryption.
   * This is set after FEATUREEXTACK is processed during login.
   * CekTable should only be parsed from COLMETADATA when this is true.
   */
  serverSupportsColumnEncryption?: boolean;
};

class Parser {
  debug: Debug;
  colMetadata: ColumnMetadata[];
  options: ParserOptions;

  iterator: AsyncIterator<Buffer, any, undefined> | Iterator<Buffer, any, undefined>;
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

  async readNbcRowToken(): Promise<NBCRowToken> {
    return await nbcRowParser(this);
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
    return rowParser(this);
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

    this.buffer = Buffer.alloc(0);
    this.position = 0;
  }

  async waitForChunk() {
    const result = await this.iterator.next();
    if (result.done) {
      throw new Error('unexpected end of data');
    }

    if (this.position === this.buffer.length) {
      this.buffer = result.value;
    } else {
      this.buffer = Buffer.concat([this.buffer.slice(this.position), result.value]);
    }

    this.position = 0;
  }
}

export default Parser;
module.exports = Parser;
