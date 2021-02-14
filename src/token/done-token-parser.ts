import JSBI from 'jsbi';

import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';
import { DoneToken, DoneInProcToken, DoneProcToken } from './token';

// s2.2.7.5/6/7

const STATUS = {
  MORE: 0x0001,
  ERROR: 0x0002,
  // This bit is not yet in use by SQL Server, so is not exposed in the returned token
  INXACT: 0x0004,
  COUNT: 0x0010,
  ATTN: 0x0020,
  SRVERROR: 0x0100
};

interface TokenData {
  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;
}

class NotEnoughDataError extends Error {
  constructor() {
    super('not enough data');
  }
}

class FakeStreamingBuffer {
  parser: Parser;

  constructor(parser: Parser) {
    this.parser = parser;
  }

  availableBytes() {
    return this.parser.buffer.length - this.parser.position;
  }

  readUInt8() {
    if (this.availableBytes() < 1) {
      throw new NotEnoughDataError();
    }

    const value = this.parser.buffer.readUInt8(this.parser.position);
    this.parser.position += 1;
    return value;
  }

  readUInt16LE() {
    if (this.availableBytes() < 2) {
      throw new NotEnoughDataError();
    }

    const value = this.parser.buffer.readUInt16LE(this.parser.position);
    this.parser.position += 2;
    return value;
  }

  readUInt32LE() {
    if (this.availableBytes() < 4) {
      throw new NotEnoughDataError();
    }

    const value = this.parser.buffer.readUInt32LE(this.parser.position);
    this.parser.position += 4;
    return value;
  }

  readBigUInt64LE() {
    if (this.availableBytes() < 8) {
      throw new NotEnoughDataError();
    }

    const low = JSBI.BigInt(this.parser.buffer.readUInt32LE(this.parser.position));
    const high = JSBI.BigInt(this.parser.buffer.readUInt32LE(this.parser.position + 4));

    this.parser.position += 8;

    return JSBI.add(low, JSBI.leftShift(high, JSBI.BigInt(32)));
  }

  awaitData(length: number) {
    return new Promise<void>((resolve) => {
      this.parser.awaitData(length, resolve);
    });
  }
}

function wrap<T>(other: (input: FakeStreamingBuffer, options: InternalConnectionOptions) => Promise<T>) {
  return function(parser: Parser, options: InternalConnectionOptions, callback: (data: T) => void) {
    other(new FakeStreamingBuffer(parser), options).then(callback, (err) => {
      process.nextTick(() => { throw err; });
    });
  };
}

function parseToken(parser: Parser, options: InternalConnectionOptions, callback: (data: TokenData) => void) {
  parser.readUInt16LE((status) => {
    const more = !!(status & STATUS.MORE);
    const sqlError = !!(status & STATUS.ERROR);
    const rowCountValid = !!(status & STATUS.COUNT);
    const attention = !!(status & STATUS.ATTN);
    const serverError = !!(status & STATUS.SRVERROR);

    parser.readUInt16LE((curCmd) => {
      const next = (rowCount: number) => {
        callback({
          more: more,
          sqlError: sqlError,
          attention: attention,
          serverError: serverError,
          rowCount: rowCountValid ? rowCount : undefined,
          curCmd: curCmd
        });
      };

      if (options.tdsVersion < '7_2') {
        parser.readUInt32LE(next);
      } else {
        parser.readBigUInt64LE((rowCount) => {
          next(JSBI.toNumber(rowCount));
        });
      }
    });
  });
}

export const doneParser = wrap(async function doneParser(input, options) {
  if (input.availableBytes() < 4) {
    await input.awaitData(4);
  }

  const status = input.readUInt16LE();
  const curCmd = input.readUInt16LE();

  let rowCount;
  if (options.tdsVersion < '7_2') {
    if (input.availableBytes() < 4) {
      await input.awaitData(4);
    }

    rowCount = input.readUInt32LE();
  } else {
    if (input.availableBytes() < 8) {
      await input.awaitData(8);
    }

    rowCount = JSBI.toNumber(input.readBigUInt64LE());
  }

  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  return new DoneToken({
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? rowCount : undefined,
    curCmd: curCmd
  });
});

// export function doneParser(parser: Parser, options: InternalConnectionOptions, callback: (token: DoneToken) => void) {
//   parseToken(parser, options, (data) => {
//     callback(new DoneToken(data));
//   });
// }

export function doneInProcParser(parser: Parser, options: InternalConnectionOptions, callback: (token: DoneInProcToken) => void) {
  parseToken(parser, options, (data) => {
    callback(new DoneInProcToken(data));
  });
}

export function doneProcParser(parser: Parser, options: InternalConnectionOptions, callback: (token: DoneProcToken) => void) {
  parseToken(parser, options, (data) => {
    callback(new DoneProcToken(data));
  });
}
