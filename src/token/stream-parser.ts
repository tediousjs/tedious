import { Transform } from 'readable-stream';

const TYPE = require('./token').TYPE;

import Debug from '../debug';
import { InternalConnectionOptions } from '../connection';

type TokenParser<T> = (parser: Parser, colMetadata: any, options: InternalConnectionOptions, doneParsing: (token: T) => void) => void;

const tokenParsers: { [key: string]: TokenParser<Token> } = {};
tokenParsers[TYPE.COLMETADATA] = require('./colmetadata-token-parser') as TokenParser<ColMetadataToken>;
tokenParsers[TYPE.DONE] = require('./done-token-parser').doneParser;
tokenParsers[TYPE.DONEINPROC] = require('./done-token-parser').doneInProcParser;
tokenParsers[TYPE.DONEPROC] = require('./done-token-parser').doneProcParser;
tokenParsers[TYPE.ENVCHANGE] = require('./env-change-token-parser');
tokenParsers[TYPE.ERROR] = require('./infoerror-token-parser').errorParser;
tokenParsers[TYPE.FEDAUTHINFO] = require('./fedauth-info-parser');
tokenParsers[TYPE.FEATUREEXTACK] = require('./feature-ext-ack-parser');
tokenParsers[TYPE.INFO] = require('./infoerror-token-parser').infoParser;
tokenParsers[TYPE.LOGINACK] = require('./loginack-token-parser');
tokenParsers[TYPE.ORDER] = require('./order-token-parser');
tokenParsers[TYPE.RETURNSTATUS] = require('./returnstatus-token-parser');
tokenParsers[TYPE.RETURNVALUE] = require('./returnvalue-token-parser');
tokenParsers[TYPE.ROW] = require('./row-token-parser');
tokenParsers[TYPE.NBCROW] = require('./nbcrow-token-parser');
tokenParsers[TYPE.SSPI] = require('./sspi-token-parser');

export type Column = {
  userType: number,
  flags: number,
  type: any,
  colName: string,
  collation?: any,
  precision?: number,
  scale?: number,
  udtInfo?: any,
  dataLength: number,
  tableName: string | string[]
}

export type ColMetadataToken = {
  name: 'COLMETADATA',
  event: 'columnMetadata',
  columns: Column[]
};

export type DoneToken = {
  name: 'DONE',
  event: 'done',
  more: boolean,
  sqlError: boolean,
  attention: boolean,
  serverError: boolean,
  rowCount?: number,
  curCmd: number
};

export type DoneInProcToken = {
  name: 'DONEINPROC',
  event: 'doneInProc',
  more: boolean,
  sqlError: boolean,
  attention: boolean,
  serverError: boolean,
  rowCount?: number,
  curCmd: number
};

export type DoneProcToken = {
  name: 'DONEPROC',
  event: 'doneProc',
  more: boolean,
  sqlError: boolean,
  attention: boolean,
  serverError: boolean,
  rowCount?: number,
  curCmd: number
};

export type InfoToken = {
  name: 'INFO',
  event: 'infoMessage'
};

export type ErrorToken = {
  name: 'ERROR',
  event: 'errorMessage'
};

export type EnvChangeToken = {
  name: 'ENVCHANGE',
  type: string,
  event: string,
  oldValue?: any,
  newValue?: any
};

export type FeatureExtAckToken = {
  name: 'FEATUREEXTACK',
  event: 'featureExtAck',
  fedAuth?: Buffer
};

export type FedAuthInfoToken = {
  name: 'FEDAUTHINFO',
  event: 'fedAuthInfo',
  spn?: string,
  stsurl?: string
};

export type LoginAckToken = {
  name: 'LOGINACK',
  event: 'loginack',
  interface: string,
  tdsVersion: string,
  progName: string,
  progVersion: {
    major: number,
    minor: number,
    buildNumHi: number,
    buildNumLow: number
  }
};

export type NBCRowToken = {
  name: 'NBCROW',
  event: 'row',
  columns: unknown[] | { [key: string]: unknown }
};

export type OrderToken = {
  name: 'ORDER',
  event: 'order',
  orderColumns: any
};

export type ReturnStatusToken = {
  name: 'RETURNSTATUS',
  event: 'returnStatus',
  value: number
};

export type ReturnValueToken = {
  name: 'RETURNVALUE',
  event: 'returnValue',
  paramOrdinal: number,
  paramName: string,
  metadata: any,
  value: unknown
};

export type RowToken = {
  name: 'ROW',
  event: 'row',
  columns: unknown[] | { [key: string]: unknown }
};

export type SSPIToken = {
  name: 'SSPICHALLENGE',
  event: 'sspichallenge',
  ntlmpacket: any,
  ntlmpacketBuffer: Buffer
}

export type EOMToken = {
  name: 'EOM',
  event: 'endOfMessage'
};

export type Token = ColMetadataToken | DoneToken | DoneInProcToken | DoneProcToken | InfoToken | ErrorToken | EnvChangeToken | FeatureExtAckToken | FedAuthInfoToken | LoginAckToken | NBCRowToken | OrderToken | ReturnStatusToken | ReturnValueToken | RowToken | SSPIToken | EOMToken;

class Parser extends Transform {
  debug: Debug;
  colMetadata?: Column[];
  options: InternalConnectionOptions;
  endOfMessageMarker: {};

  buffer: Buffer;
  position: number;
  suspended: boolean;
  next?: () => void;

  constructor(debug: Debug, colMetadata: Column[] | undefined, options: InternalConnectionOptions) {
    super({ objectMode: true });

    this.debug = debug;
    this.colMetadata = colMetadata;
    this.options = options;
    this.endOfMessageMarker = {};

    this.buffer = Buffer.alloc(0);
    this.position = 0;
    this.suspended = false;
    this.next = undefined;
  }

  _transform(input: Buffer | {}, _encoding: string, done: (err?: Error | null, token?: Token) => void) {
    if (!(input instanceof Buffer)) {
      done(null, { // generate endOfMessage pseudo token
        name: 'EOM',
        event: 'endOfMessage'
      });
      return;
    }

    if (this.position === this.buffer.length) {
      this.buffer = input;
    } else {
      this.buffer = Buffer.concat([this.buffer.slice(this.position), input]);
    }
    this.position = 0;

    if (this.suspended) {
      // Unsuspend and continue from where ever we left off.
      this.suspended = false;
      this.next!.call(null);
    }

    // If we're no longer suspended, parse new tokens
    if (!this.suspended) {
      // Start the parser
      this.parseTokens();
    }

    done();
  }

  parseTokens() {
    const doneParsing = (token: Token) => {
      if (token) {
        switch (token.name) {
          case 'COLMETADATA':
            this.colMetadata = token.columns;
        }

        this.push(token);
      }
    };

    while (!this.suspended && this.position + 1 <= this.buffer.length) {
      const type = this.buffer.readUInt8(this.position);

      this.position += 1;

      if (tokenParsers[type]) {
        tokenParsers[type](this, this.colMetadata, this.options, doneParsing);
      } else {
        this.emit('error', new Error('Unknown type: ' + type));
      }
    }
  }

  suspend(next: () => void) {
    this.suspended = true;
    this.next = next;
  }

  awaitData(length: number, callback: () => void) {
    if (this.position + length <= this.buffer.length) {
      callback();
    } else {
      this.suspend(() => {
        this.awaitData(length, callback);
      });
    }
  }

  readInt8(callback: (data: number) => void) {
    this.awaitData(1, () => {
      const data = this.buffer.readInt8(this.position);
      this.position += 1;
      callback(data);
    });
  }

  readUInt8(callback: (data: number) => void) {
    this.awaitData(1, () => {
      const data = this.buffer.readUInt8(this.position);
      this.position += 1;
      callback(data);
    });
  }

  readInt16LE(callback: (data: number) => void) {
    this.awaitData(2, () => {
      const data = this.buffer.readInt16LE(this.position);
      this.position += 2;
      callback(data);
    });
  }

  readInt16BE(callback: (data: number) => void) {
    this.awaitData(2, () => {
      const data = this.buffer.readInt16BE(this.position);
      this.position += 2;
      callback(data);
    });
  }

  readUInt16LE(callback: (data: number) => void) {
    this.awaitData(2, () => {
      const data = this.buffer.readUInt16LE(this.position);
      this.position += 2;
      callback(data);
    });
  }

  readUInt16BE(callback: (data: number) => void) {
    this.awaitData(2, () => {
      const data = this.buffer.readUInt16BE(this.position);
      this.position += 2;
      callback(data);
    });
  }

  readInt32LE(callback: (data: number) => void) {
    this.awaitData(4, () => {
      const data = this.buffer.readInt32LE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readInt32BE(callback: (data: number) => void) {
    this.awaitData(4, () => {
      const data = this.buffer.readInt32BE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readUInt32LE(callback: (data: number) => void) {
    this.awaitData(4, () => {
      const data = this.buffer.readUInt32LE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readUInt32BE(callback: (data: number) => void) {
    this.awaitData(4, () => {
      const data = this.buffer.readUInt32BE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readInt64LE(callback: (data: number) => void) {
    this.awaitData(8, () => {
      const data = Math.pow(2, 32) * this.buffer.readInt32LE(this.position + 4) + ((this.buffer[this.position + 4] & 0x80) === 0x80 ? 1 : -1) * this.buffer.readUInt32LE(this.position);
      this.position += 8;
      callback(data);
    });
  }

  readInt64BE(callback: (data: number) => void) {
    this.awaitData(8, () => {
      const data = Math.pow(2, 32) * this.buffer.readInt32BE(this.position) + ((this.buffer[this.position] & 0x80) === 0x80 ? 1 : -1) * this.buffer.readUInt32BE(this.position + 4);
      this.position += 8;
      callback(data);
    });
  }

  readUInt64LE(callback: (data: number) => void) {
    this.awaitData(8, () => {
      const data = Math.pow(2, 32) * this.buffer.readUInt32LE(this.position + 4) + this.buffer.readUInt32LE(this.position);
      this.position += 8;
      callback(data);
    });
  }

  readUInt64BE(callback: (data: number) => void) {
    this.awaitData(8, () => {
      const data = Math.pow(2, 32) * this.buffer.readUInt32BE(this.position) + this.buffer.readUInt32BE(this.position + 4);
      this.position += 8;
      callback(data);
    });
  }

  readFloatLE(callback: (data: number) => void) {
    this.awaitData(4, () => {
      const data = this.buffer.readFloatLE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readFloatBE(callback: (data: number) => void) {
    this.awaitData(4, () => {
      const data = this.buffer.readFloatBE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readDoubleLE(callback: (data: number) => void) {
    this.awaitData(8, () => {
      const data = this.buffer.readDoubleLE(this.position);
      this.position += 8;
      callback(data);
    });
  }

  readDoubleBE(callback: (data: number) => void) {
    this.awaitData(8, () => {
      const data = this.buffer.readDoubleBE(this.position);
      this.position += 8;
      callback(data);
    });
  }

  readUInt24LE(callback: (data: number) => void) {
    this.awaitData(3, () => {
      const low = this.buffer.readUInt16LE(this.position);
      const high = this.buffer.readUInt8(this.position + 2);

      this.position += 3;

      callback(low | (high << 16));
    });
  }

  readUInt40LE(callback: (data: number) => void) {
    this.awaitData(5, () => {
      const low = this.buffer.readUInt32LE(this.position);
      const high = this.buffer.readUInt8(this.position + 4);

      this.position += 5;

      callback((0x100000000 * high) + low);
    });
  }

  readUNumeric64LE(callback: (data: number) => void) {
    this.awaitData(8, () => {
      const low = this.buffer.readUInt32LE(this.position);
      const high = this.buffer.readUInt32LE(this.position + 4);

      this.position += 8;

      callback((0x100000000 * high) + low);
    });
  }

  readUNumeric96LE(callback: (data: number) => void) {
    this.awaitData(12, () => {
      const dword1 = this.buffer.readUInt32LE(this.position);
      const dword2 = this.buffer.readUInt32LE(this.position + 4);
      const dword3 = this.buffer.readUInt32LE(this.position + 8);

      this.position += 12;

      callback(dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3));
    });
  }

  readUNumeric128LE(callback: (data: number) => void) {
    this.awaitData(16, () => {
      const dword1 = this.buffer.readUInt32LE(this.position);
      const dword2 = this.buffer.readUInt32LE(this.position + 4);
      const dword3 = this.buffer.readUInt32LE(this.position + 8);
      const dword4 = this.buffer.readUInt32LE(this.position + 12);

      this.position += 16;

      callback(dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3) + (0x100000000 * 0x100000000 * 0x100000000 * dword4));
    });
  }

  // Variable length data

  readBuffer(length: number, callback: (data: Buffer) => void) {
    this.awaitData(length, () => {
      const data = this.buffer.slice(this.position, this.position + length);
      this.position += length;
      callback(data);
    });
  }

  // Read a Unicode String (BVARCHAR)
  readBVarChar(callback: (data: string) => void) {
    this.readUInt8((length) => {
      this.readBuffer(length * 2, (data) => {
        callback(data.toString('ucs2'));
      });
    });
  }

  // Read a Unicode String (USVARCHAR)
  readUsVarChar(callback: (data: string) => void) {
    this.readUInt16LE((length) => {
      this.readBuffer(length * 2, (data) => {
        callback(data.toString('ucs2'));
      });
    });
  }

  // Read binary data (BVARBYTE)
  readBVarByte(callback: (data: Buffer) => void) {
    this.readUInt8((length) => {
      this.readBuffer(length, callback);
    });
  }

  // Read binary data (USVARBYTE)
  readUsVarByte(callback: (data: Buffer) => void) {
    this.readUInt16LE((length) => {
      this.readBuffer(length, callback);
    });
  }
}

export default Parser;
module.exports = Parser;
