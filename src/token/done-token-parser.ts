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

class FakeStreamBuffer {
  parser: Parser;

  constructor(parser: Parser) {
    this.parser = parser;
  }

  availableBytes(): number {
    return this.parser.buffer.length - this.parser.position;
  }

  assertEnoughBytes(length: number) {
    if (this.availableBytes() < length) {
      throw new NotEnoughDataError();
    }
  }

  awaitData(length: number): Promise<void> {
    return new Promise((resolve) => {
      this.parser.awaitData(length, resolve);
    });
  }

  readUInt8() {
    this.assertEnoughBytes(1);

    const value = this.parser.buffer.readUInt8(this.parser.position);
    this.parser.position += 1;
    return value;
  }

  readUInt16LE() {
    this.assertEnoughBytes(2);

    const value = this.parser.buffer.readUInt16LE(this.parser.position);
    this.parser.position += 2;
    return value;
  }

  readUInt32LE() {
    this.assertEnoughBytes(4);

    const value = this.parser.buffer.readUInt32LE(this.parser.position);
    this.parser.position += 4;
    return value;
  }

  readBigUInt64LE(): JSBI {
    this.assertEnoughBytes(8);

    const low = JSBI.BigInt(this.parser.buffer.readUInt32LE(this.parser.position));
    const high = JSBI.BigInt(this.parser.buffer.readUInt32LE(this.parser.position + 4));

    this.parser.position += 8;

    return JSBI.add(low, JSBI.leftShift(high, JSBI.BigInt(32)));
  }
}

async function newParseToken(input: FakeStreamBuffer, options: InternalConnectionOptions): Promise<TokenData> {
  if (input.availableBytes() < 8) {
    await input.awaitData(8);
  }

  const status = input.readUInt16LE();
  const curCmd = input.readUInt16LE();
  let rowCount;
  if (options.tdsVersion < '7_2') {
    rowCount = input.readUInt32LE();
  } else {
    rowCount = JSBI.toNumber(input.readBigUInt64LE());
  }

  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  return {
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? rowCount : undefined,
    curCmd: curCmd
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

export function doneParser(parser: Parser, options: InternalConnectionOptions, callback: (token: DoneToken) => void) {
  const streamBuffer = new FakeStreamBuffer(parser);

  parser.waitForPromise(newParseToken(streamBuffer, options), (data) => {
    callback(new DoneToken(data));
  });
}

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
