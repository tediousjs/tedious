import Debug from '../debug';
import { InternalConnectionOptions } from '../connection';
import ReadableTrackingBuffer from '../tracking-buffer/readable-tracking-buffer';
import JSBI from 'jsbi';

import { Transform } from 'readable-stream';
import { TYPE, Token, EndOfMessageToken, ColMetadataToken } from './token';

import colMetadataParser, { ColumnMetadata } from './colmetadata-token-parser';
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

const tokenParsers = {
  [TYPE.COLMETADATA]: colMetadataParser,
  [TYPE.DONE]: doneParser,
  [TYPE.DONEINPROC]: doneInProcParser,
  [TYPE.DONEPROC]: doneProcParser,
  [TYPE.ENVCHANGE]: envChangeParser,
  [TYPE.ERROR]: errorParser,
  [TYPE.FEDAUTHINFO]: fedAuthInfoParser,
  [TYPE.FEATUREEXTACK]: featureExtAckParser,
  [TYPE.INFO]: infoParser,
  [TYPE.LOGINACK]: loginAckParser,
  [TYPE.ORDER]: orderParser,
  [TYPE.RETURNSTATUS]: returnStatusParser,
  [TYPE.RETURNVALUE]: returnValueParser,
  [TYPE.ROW]: rowParser,
  [TYPE.NBCROW]: nbcRowParser,
  [TYPE.SSPI]: sspiParser
};

class EndOfMessageMarker {}

class Parser extends Transform {
  debug: Debug;
  colMetadata: ColumnMetadata[];
  options: InternalConnectionOptions;
  endOfMessageMarker: EndOfMessageMarker;

  buffers: ReadableTrackingBuffer[];
  suspended: boolean;
  processingQueue: number;
  readyToEnd: boolean;
  next?: () => void;

  constructor(debug: Debug, options: InternalConnectionOptions) {
    super({ objectMode: true });

    this.debug = debug;
    this.colMetadata = [];
    this.options = options;
    this.endOfMessageMarker = new EndOfMessageMarker();

    this.buffers = [ new ReadableTrackingBuffer(Buffer.alloc(0)) ];
    this.suspended = false;
    this.next = undefined;
    this.readyToEnd = false;
    this.processingQueue = 0;
  }

  streamBuffer() {
    return this.buffers[0];
  }

  activeBuffer() {
    const lastBufferIndex = this.buffers.length - 1;
    return this.buffers[lastBufferIndex];
  }

  processingStarted() {
    this.processingQueue += 1;
  }

  processingComplete() {
    this.processingQueue -= 1;
    this.pushEndOfMessage();
  }

  pushEndOfMessage() {
    if (this.processingQueue <= 0 && this.readyToEnd === true && this.activeBuffer().availableLength() === 0) {
      this.readyToEnd = false;
      this.push(new EndOfMessageToken());
    }
  }

  pushIntermediateBuffer(input: Buffer) {
    this.buffers.push(new ReadableTrackingBuffer(input));
  }

  popIntermediateBuffer() {
    this.buffers.pop();
  }

  _transform(input: Buffer | EndOfMessageMarker, _encoding: string, done: (error?: Error | undefined, token?: Token) => void) {
    if (input instanceof EndOfMessageMarker) {
      this.readyToEnd = true;
      this.pushEndOfMessage();
      done();
      return;
    }

    this.streamBuffer().concat(input);

    if (this.suspended) {
      // Unsuspend and continue from where ever we left off.
      this.suspended = false;
      const next = this.next!;

      next();
    }

    // If we're no longer suspended, parse new tokens
    if (!this.suspended) {
      // Start the parser
      this.parseTokens();
    }

    done();
  }

  async parseTokens() {
    const doneParsing = (token: Token | undefined) => {
      if (token) {
        if (token instanceof ColMetadataToken) {
          this.colMetadata = token.columns;
        }
        this.debug.token(token);
        this.push(token);
      }
      this.processingComplete();
    };

    while (!this.suspended && this.activeBuffer().availableLength() > 0) {
      this.processingStarted();
      await new Promise((resolve) => {
        this.readUInt8((type) => {
          if (tokenParsers[type]) {
            tokenParsers[type](this, this.options, (token: Token | undefined) => {
              doneParsing(token);
              resolve();
            });
          } else {
            this.emit('error', new Error('Unknown type: ' + type));
          }
        });
      });

    }
  }

  suspend(next: () => void) {
    this.suspended = true;
    this.next = next;
  }

  awaitData(length: number, callback: () => void) {
    if (this.buffers.length > 1) {
      // inside an intermediate buffer
      // use the readable-buffer await-data to verify enough data exists
      // if not, this will throw an insufficient-data error
      try {
        return this.activeBuffer().awaitData(length, callback);
      } catch (err) {
        return this.emit('error', err);
      }
    }

    // inside the main buffer, check if enough is available or wait if not
    if (this.activeBuffer().availableLength() >= length) {
      callback();
    } else {
      this.suspend(() => {
        this.awaitData(length, callback);
      });
    }
  }

  readInt8(callback: (data: number) => void) {
    this.awaitData(1, () => this.activeBuffer().readInt8(callback));
  }

  readUInt8(callback: (data: number) => void) {
    this.awaitData(1, () => this.activeBuffer().readUInt8(callback));
  }

  readInt16LE(callback: (data: number) => void) {
    this.awaitData(2, () => this.activeBuffer().readInt16LE(callback));
  }

  readInt16BE(callback: (data: number) => void) {
    this.awaitData(2, () => this.activeBuffer().readInt16BE(callback));
  }

  readUInt16LE(callback: (data: number) => void) {
    this.awaitData(2, () => this.activeBuffer().readUInt16LE(callback));
  }

  readUInt16BE(callback: (data: number) => void) {
    this.awaitData(2, () => this.activeBuffer().readUInt16BE(callback));
  }

  readInt32LE(callback: (data: number) => void) {
    this.awaitData(4, () => this.activeBuffer().readInt32LE(callback));
  }

  readInt32BE(callback: (data: number) => void) {
    this.awaitData(4, () => this.activeBuffer().readInt32BE(callback));
  }

  readUInt32LE(callback: (data: number) => void) {
    this.awaitData(4, () => this.activeBuffer().readUInt32LE(callback));
  }

  readUInt32BE(callback: (data: number) => void) {
    this.awaitData(4, () => this.activeBuffer().readUInt32BE(callback));
  }

  readBigInt64LE(callback: (data: JSBI) => void) {
    this.awaitData(8, () => this.activeBuffer().readBigInt64LE(callback));
  }

  readInt64LE(callback: (data: number) => void) {
    this.awaitData(8, () => this.activeBuffer().readInt64LE(callback));
  }

  readInt64BE(callback: (data: number) => void) {
    this.awaitData(8, () => this.activeBuffer().readInt64BE(callback));
  }

  readBigUInt64LE(callback: (data: JSBI) => void) {
    this.awaitData(8, () => this.activeBuffer().readBigUInt64LE(callback));
  }

  readUInt64LE(callback: (data: number) => void) {
    this.awaitData(8, () => this.activeBuffer().readUInt64LE(callback));
  }

  readUInt64BE(callback: (data: number) => void) {
    this.awaitData(8, () => this.activeBuffer().readUInt64BE(callback));
  }

  readFloatLE(callback: (data: number) => void) {
    this.awaitData(4, () => this.activeBuffer().readFloatLE(callback));
  }

  readFloatBE(callback: (data: number) => void) {
    this.awaitData(4, () => this.activeBuffer().readFloatBE(callback));
  }

  readDoubleLE(callback: (data: number) => void) {
    this.awaitData(8, () => this.activeBuffer().readDoubleLE(callback));
  }

  readDoubleBE(callback: (data: number) => void) {
    this.awaitData(8, () => this.activeBuffer().readDoubleBE(callback));
  }

  readUInt24LE(callback: (data: number) => void) {
    this.awaitData(3, () => this.activeBuffer().readUInt24LE(callback));
  }

  readUInt40LE(callback: (data: number) => void) {
    this.awaitData(5, () => this.activeBuffer().readUInt40LE(callback));
  }

  readUNumeric64LE(callback: (data: number) => void) {
    this.awaitData(8, () => this.activeBuffer().readUNumeric64LE(callback));
  }

  readUNumeric96LE(callback: (data: number) => void) {
    this.awaitData(12, () => this.activeBuffer().readUNumeric96LE(callback));
  }

  readUNumeric128LE(callback: (data: number) => void) {
    this.awaitData(16, () => this.activeBuffer().readUNumeric128LE(callback));
  }

  // Variable length data

  readBuffer(length: number, callback: (data: Buffer) => void) {
    this.awaitData(length, () => this.activeBuffer().readBuffer(length, callback));
  }

  // Read a Unicode String (BVARCHAR)
  readBVarChar(callback: (data: string) => void) {
    // read the length and buffer separately to ensure it awaits data correctly
    this.readUInt8((length) => {
      this.readBuffer(length * 2, (data) => {
        callback(data.toString('ucs2'));
      });
    });
  }

  // Read a Unicode String (USVARCHAR)
  readUsVarChar(callback: (data: string) => void) {
    // read the length and buffer separately to ensure it awaits data correctly
    this.readUInt16LE((length) => {
      this.readBuffer(length * 2, (data) => {
        callback(data.toString('ucs2'));
      });
    });
  }

  // Read binary data (BVARBYTE)
  readBVarByte(callback: (data: Buffer) => void) {
    // read the length and buffer separately to ensure it awaits data correctly
    this.readUInt8((length) => {
      this.readBuffer(length, callback);
    });
  }

  // Read binary data (USVARBYTE)
  readUsVarByte(callback: (data: Buffer) => void) {
    // read the length and buffer separately to ensure it awaits data correctly
    this.readUInt16LE((length) => {
      this.readBuffer(length, callback);
    });
  }
}

export default Parser;
module.exports = Parser;
