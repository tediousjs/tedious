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

class NotEnoughDataError extends Error {}

function readBigUInt64LE(buffer: Buffer, offset: number) {
  return JSBI.add(
    JSBI.leftShift(
      JSBI.BigInt(
        buffer[offset + 4] +
        buffer[offset + 5] * 2 ** 8 +
        buffer[offset + 6] * 2 ** 16 +
        (buffer[offset + 7] << 24) // Overflow
      ),
      JSBI.BigInt(32)
    ),
    JSBI.BigInt(
      buffer[offset] +
      buffer[offset + 1] * 2 ** 8 +
      buffer[offset + 2] * 2 ** 16 +
      buffer[offset + 3] * 2 ** 24
    )
  );
}

function parseToken(parser: Parser, options: InternalConnectionOptions) {
  const buffer = parser.buffer;
  let offset = parser.position;

  if (buffer.length < offset + 2) {
    throw new NotEnoughDataError();
  }
  const status = buffer.readUInt16LE(offset);
  offset += 2;

  if (buffer.length < offset + 2) {
    throw new NotEnoughDataError();
  }
  const curCmd = buffer.readUInt16LE(offset);
  offset += 2;

  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  let rowCount: number;
  if (options.tdsVersion < '7_2') {
    if (buffer.length < offset + 4) {
      throw new NotEnoughDataError();
    }

    rowCount = buffer.readUInt32LE(offset);
    offset += 4;
  } else {
    if (buffer.length < offset + 8) {
      throw new NotEnoughDataError();
    }

    const bigRowCount = readBigUInt64LE(buffer, offset);
    offset += 8;

    rowCount = JSBI.toNumber(bigRowCount);
  }

  parser.position = offset;

  return {
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? rowCount : undefined,
    curCmd: curCmd
  } as TokenData;
}

export function doneParser(parser: Parser, options: InternalConnectionOptions, callback: (token: DoneToken) => void) {
  let data;

  try {
    data = parseToken(parser, options);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        doneParser(parser, options, callback);
      });
    }

    throw err;
  }

  callback(new DoneToken(data));
}

export function doneInProcParser(parser: Parser, options: InternalConnectionOptions, callback: (token: DoneInProcToken) => void) {
  let data;

  try {
    data = parseToken(parser, options);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        doneInProcParser(parser, options, callback);
      });
    }

    throw err;
  }

  callback(new DoneInProcToken(data));
}

export function doneProcParser(parser: Parser, options: InternalConnectionOptions, callback: (token: DoneProcToken) => void) {
  let data;

  try {
    data = parseToken(parser, options);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        doneProcParser(parser, options, callback);
      });
    }

    throw err;
  }

  callback(new DoneProcToken(data));
}
