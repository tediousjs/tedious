import JSBI from 'jsbi';

import { DoneToken, DoneInProcToken, DoneProcToken } from './token';
import { IncompleteError, Result, wrap } from '../parser';

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

function readBigUInt64LE(buffer: Buffer, position: number) {
  const low = JSBI.BigInt(buffer.readUInt32LE(position));
  const high = JSBI.BigInt(buffer.readUInt32LE(position + 4));

  return JSBI.add(low, JSBI.leftShift(high, JSBI.BigInt(32)));
}

function parseToken70(buffer: Buffer, offset: number): Result<TokenData> {
  if (buffer.length < offset + 8) {
    throw new IncompleteError();
  }

  const status = buffer.readUInt16LE(offset);
  const curCmd = buffer.readUInt16LE(offset + 2);
  const rowCount = buffer.readUInt32LE(offset + 4);

  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  return new Result(offset + 8, {
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? rowCount : undefined,
    curCmd: curCmd
  });
}

function parseToken72(buffer: Buffer, offset: number): Result<TokenData> {
  if (buffer.length < offset + 12) {
    throw new IncompleteError();
  }

  const status = buffer.readUInt16LE(offset);
  const curCmd = buffer.readUInt16LE(offset + 2);
  const rowCount = JSBI.toNumber(readBigUInt64LE(buffer, offset + 4));

  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  return new Result(offset + 12, {
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? rowCount : undefined,
    curCmd: curCmd
  });
}

export const doneParser = wrap(function doneParser(buffer, offset, { options }) {
  let data;

  if (options.tdsVersion < '7_2') {
    ({ offset, value: data } = parseToken70(buffer, offset));
  } else {
    ({ offset, value: data } = parseToken72(buffer, offset));
  }

  return new Result(offset, new DoneToken(data));
});

export const doneInProcParser = wrap(function doneInProcParser(buffer, offset, { options }) {
  let data;

  if (options.tdsVersion < '7_2') {
    ({ offset, value: data } = parseToken70(buffer, offset));
  } else {
    ({ offset, value: data } = parseToken72(buffer, offset));
  }

  return new Result(offset, new DoneInProcToken(data));
});

export const doneProcParser = wrap(function doneProcParser(buffer, offset, { options }) {
  let data;

  if (options.tdsVersion < '7_2') {
    ({ offset, value: data } = parseToken70(buffer, offset));
  } else {
    ({ offset, value: data } = parseToken72(buffer, offset));
  }

  return new Result(offset, new DoneProcToken(data));
});
