import StreamParser from "../stream-parser";
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

export default class Parser extends StreamParser {
  constructor(debug, colMetadata, options) {
    super();

    this.debug = debug;
    this.colMetadata = colMetadata;
    this.options = options;
  }

  *parser() {
    for (;;) {
      const type = yield this.readUInt8();
      if (tokenParsers[type]) {
        const token = yield* tokenParsers[type](this, this.colMetadata, this.options);
        if (token) {
          this.debug.token(token);

          switch (token.name) {
            case 'COLMETADATA':
              this.colMetadata = token.columns;
          }

          this.push(token);
        }
      } else {
        throw new Error("Token type " + type + " not implemented");
      }
    }
  }

  // Read a Unicode String (BVARCHAR)
  *readBVarChar() {
    const length = yield this.readUInt8();
    const data = yield this.readBuffer(length * 2);
    return data.toString("ucs2");
  }

  // Read a Unicode String (USVARCHAR)
  *readUsVarChar() {
    const length = yield this.readUInt16LE();
    const data = yield this.readBuffer(length * 2);
    return data.toString("ucs2");
  }

  // Read binary data (BVARBYTE)
  *readBVarByte() {
    const length = yield this.readUInt8();
    return yield this.readBuffer(length);
  }

  // Read binary data (USVARBYTE)
  *readUsVarByte() {
    const length = yield this.readUInt16LE();
    return yield this.readBuffer(length);
  }

  *readUInt24LE() {
    const low = yield this.readUInt16LE();
    const high = yield this.readUInt8();
    return low | (high << 16);
  }

  *readUInt40LE() {
    const low = yield this.readUInt32LE();
    const high = yield this.readUInt8();
    return (0x100000000 * high) + low;
  }

  *readUNumeric64LE() {
    const low = yield this.readUInt32LE();
    const high = yield this.readUInt32LE();
    return (0x100000000 * high) + low;
  }

  *readUNumeric96LE() {
    const dword1 = yield this.readUInt32LE();
    const dword2 = yield this.readUInt32LE();
    const dword3 = yield this.readUInt32LE();
    return dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3);
  }

  *readUNumeric128LE() {
    const dword1 = yield this.readUInt32LE();
    const dword2 = yield this.readUInt32LE();
    const dword3 = yield this.readUInt32LE();
    const dword4 = yield this.readUInt32LE();
    return dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3) + (0x100000000 * 0x100000000 * 0x100000000 * dword4);
  }
}
