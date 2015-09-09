import { Transform } from "readable-stream";
import { TYPE } from "./token";

const tokenParsers = {
  [TYPE.COLMETADATA]: require('./colmetadata-token-parser'),

  [TYPE.DONE]: require('./done-token-parser').doneParser,
  [TYPE.DONEINPROC]: require('./done-token-parser').doneInProcParser,
  [TYPE.DONEPROC]: require('./done-token-parser').doneProcParser,

  [TYPE.ENVCHANGE]: require('./env-change-token-parser'),
  [TYPE.ERROR]: require('./infoerror-token-parser').errorParser,
  [TYPE.INFO]: require('./infoerror-token-parser').infoParser,
  [TYPE.LOGINACK]: require('./loginack-token-parser'),
  [TYPE.ORDER]: require('./order-token-parser'),
  [TYPE.RETURNSTATUS]: require('./returnstatus-token-parser'),
  [TYPE.RETURNVALUE]: require('./returnvalue-token-parser'),
  [TYPE.ROW]: require('./row-token-parser'),
  [TYPE.NBCROW]: require('./nbcrow-token-parser'),
  [TYPE.SSPI]: require('./sspi-token-parser')
};

export default class Parser extends Transform {
  constructor(debug, colMetadata, options) {
    super({ objectMode: true });

    this.debug = debug;
    this.colMetadata = colMetadata;
    this.options = options;

    this.nextStep = undefined;
    this.buffer = new Buffer(0);
    this.position = 0;
    this.await = undefined;
    this.next = undefined;
  }

  _transform(input, encoding, done) {
    if (this.position === this.buffer.length) {
      this.buffer = input;
    } else {
      this.buffer = Buffer.concat([this.buffer.slice(this.position), input]);
    }
    this.position = 0;

    // This will be called once we need to wait for more data to
    // become available
    this.await = done;

    if (!this.next) {
      // Start the parser
      this.parseNextToken();
    } else {
      // Continue from the last location
      this.next();
    }
  }

  parseNextToken() {
    this.readUInt8((type) => {
      if (tokenParsers[type]) {
        tokenParsers[type](this, this.colMetadata, this.options, (token) => {
          if (token) {
            switch (token.name) {
              case 'COLMETADATA':
                this.colMetadata = token.columns;
            }

            this.push(token);
          }

          this.parseNextToken();
        });
      } else {
        this.emit('error', new Error("Unknown type: " + type));
      }
    });
  }

  awaitData(length, callback) {
    if (this.position + length <= this.buffer.length) {
      callback();
    } else {
      this.next = () => {
        this.awaitData(length, callback);
      };
      this.await();
    }
  }

  readInt8(callback) {
    this.awaitData(1, () => {
      const data = this.buffer.readInt8(this.position);
      this.position += 1;
      callback(data);
    });
  }

  readUInt8(callback) {
    this.awaitData(1, () => {
      const data = this.buffer.readUInt8(this.position);
      this.position += 1;
      callback(data);
    });
  }

  readInt16LE(callback) {
    this.awaitData(2, () => {
      const data = this.buffer.readInt16LE(this.position);
      this.position += 2;
      callback(data);
    });
  }

  readInt16BE(callback) {
    this.awaitData(2, () => {
      const data = this.buffer.readInt16BE(this.position);
      this.position += 2;
      callback(data);
    });
  }

  readUInt16LE(callback) {
    this.awaitData(2, () => {
      const data = this.buffer.readUInt16LE(this.position);
      this.position += 2;
      callback(data);
    });
  }

  readUInt16BE(callback) {
    this.awaitData(2, () => {
      const data = this.buffer.readUInt16BE(this.position);
      this.position += 2;
      callback(data);
    });
  }

  readInt32LE(callback) {
    this.awaitData(4, () => {
      const data = this.buffer.readInt32LE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readInt32BE(callback) {
    this.awaitData(4, () => {
      const data = this.buffer.readInt32BE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readUInt32LE(callback) {
    this.awaitData(4, () => {
      const data = this.buffer.readUInt32LE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readUInt32BE(callback) {
    this.awaitData(4, () => {
      const data = this.buffer.readUInt32BE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readInt64LE(callback) {
    this.awaitData(8, () => {
      const data = Math.pow(2, 32) * this.buffer.readInt32LE(this.position + 4) + (this.buffer[this.position + 4] & 0x80 === 0x80 ? 1 : -1) * this.buffer.readUInt32LE(this.position);
      this.position += 8;
      callback(data);
    });
  }

  readInt64BE(callback) {
    this.awaitData(8, () => {
      const data = Math.pow(2, 32) * this.buffer.readInt32BE(this.position) + (this.buffer[this.position] & 0x80 === 0x80 ? 1 : -1) * this.buffer.readUInt32BE(this.position + 4);
      this.position += 8;
      callback(data);
    });
  }

  readUInt64LE(callback) {
    this.awaitData(8, () => {
      const data = Math.pow(2, 32) * this.buffer.readUInt32LE(this.position + 4) + this.buffer.readUInt32LE(this.position);
      this.position += 8;
      callback(data);
    });
  }

  readUInt64BE(callback) {
    this.awaitData(8, () => {
      const data = Math.pow(2, 32) * this.buffer.readUInt32BE(this.position) + this.buffer.readUInt32BE(this.position + 4);
      this.position += 8;
      callback(data);
    });
  }

  readFloatLE(callback) {
    this.awaitData(4, () => {
      const data = this.buffer.readFloatLE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readFloatBE(callback) {
    this.awaitData(4, () => {
      const data = this.buffer.readFloatBE(this.position);
      this.position += 4;
      callback(data);
    });
  }

  readDoubleLE(callback) {
    this.awaitData(8, () => {
      const data = this.buffer.readDoubleLE(this.position);
      this.position += 8;
      callback(data);
    });
  }

  readDoubleBE(callback) {
    this.awaitData(8, () => {
      const data = this.buffer.readDoubleBE(this.position);
      this.position += 8;
      callback(data);
    });
  }

  readUInt24LE(callback) {
    this.awaitData(3, () => {
      const low = this.buffer.readUInt16LE(this.position);
      const high = this.buffer.readUInt8(this.position + 2);

      this.position += 3;

      callback(low | (high << 16));
    });
  }

  readUInt40LE(callback) {
    this.awaitData(5, () => {
      const low = this.buffer.readUInt32LE(this.position);
      const high = this.buffer.readUInt8(this.position + 4);

      this.position += 5;

      callback((0x100000000 * high) + low);
    });
  }

  readUNumeric64LE(callback) {
    this.awaitData(8, () => {
      const low = this.buffer.readUInt32LE(this.position);
      const high = this.buffer.readUInt32LE(this.position + 4);

      this.position += 8;

      callback((0x100000000 * high) + low);
    });
  }

  readUNumeric96LE(callback) {
    this.awaitData(12, () => {
      const dword1 = this.buffer.readUInt32LE(this.position);
      const dword2 = this.buffer.readUInt32LE(this.position + 4);
      const dword3 = this.buffer.readUInt32LE(this.position + 8);

      this.position += 12;

      callback(dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3));
    });
  }

  readUNumeric128LE(callback) {
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

  readBuffer(length, callback) {
    this.awaitData(length, () => {
      const data = this.buffer.slice(this.position, this.position + length);
      this.position += length;
      callback(data);
    });
  }

  // Read a Unicode String (BVARCHAR)
  readBVarChar(callback) {
    this.readUInt8((length) => {
      this.readBuffer(length * 2, (data) => {
        callback(data.toString("ucs2"));
      });
    });
  }

  // Read a Unicode String (USVARCHAR)
  readUsVarChar(callback) {
    this.readUInt16LE((length) => {
      this.readBuffer(length * 2, (data) => {
        callback(data.toString("ucs2"));
      });
    });
  }

  // Read binary data (BVARBYTE)
  readBVarByte(callback) {
    this.readUInt8((length) => {
      this.readBuffer(length, callback);
    });
  }

  // Read binary data (USVARBYTE)
  readUsVarByte(callback) {
    this.readUInt16LE((length) => {
      this.readBuffer(length, callback);
    });
  }
}
