import type { BufferList } from 'bl/BufferList';
import { type ParserOptions } from './stream-parser';
import { DoneToken, DoneInProcToken, DoneProcToken } from './token';
import { type Result, readBigUInt64LE, readUInt16LE, readUInt32LE } from './helpers';

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

function readToken(buf: Buffer | BufferList, offset: number, options: ParserOptions): Result<TokenData> {
  let status;
  ({ offset, value: status } = readUInt16LE(buf, offset));

  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  let curCmd;
  ({ offset, value: curCmd } = readUInt16LE(buf, offset));

  let rowCount;
  ({ offset, value: rowCount } = (options.tdsVersion < '7_2' ? readUInt32LE : readBigUInt64LE)(buf, offset));

  return {
    value: {
      more: more,
      sqlError: sqlError,
      attention: attention,
      serverError: serverError,
      rowCount: rowCountValid ? Number(rowCount) : undefined,
      curCmd: curCmd
    },
    offset: offset
  };
}

export function doneParser(buf: Buffer | BufferList, offset: number, options: ParserOptions): Result<DoneToken> {
  let value;
  ({ offset, value } = readToken(buf, offset, options));
  return { value: new DoneToken(value), offset };
}

export function doneInProcParser(buf: Buffer | BufferList, offset: number, options: ParserOptions): Result<DoneInProcToken> {
  let value;
  ({ offset, value } = readToken(buf, offset, options));
  return { value: new DoneInProcToken(value), offset };
}

export function doneProcParser(buf: Buffer | BufferList, offset: number, options: ParserOptions): Result<DoneProcToken> {
  let value;
  ({ offset, value } = readToken(buf, offset, options));
  return { value: new DoneProcToken(value), offset };
}
