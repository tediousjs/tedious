import LegacyParser, { ParserOptions } from './stream-parser';
import { DoneToken, DoneInProcToken, DoneProcToken } from './token';

import { BigUInt64LE, Sequence, UInt16LE, UInt32LE, Map } from '../parser';

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

function buildTokenData(status: number, curCmd: number, rowCount: bigint | number): TokenData {
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
    rowCount: rowCountValid ? Number(rowCount) : undefined,
    curCmd: curCmd
  };
}

function buildDoneProcToken([status, curCmd, rowCount]: [number, number, bigint | number]): DoneProcToken {
  return new DoneProcToken(buildTokenData(status, curCmd, rowCount));
}

function buildDoneInProcToken([status, curCmd, rowCount]: [number, number, bigint | number]): DoneInProcToken {
  return new DoneInProcToken(buildTokenData(status, curCmd, rowCount));
}

function buildDoneToken([status, curCmd, rowCount]: [number, number, bigint | number]): DoneToken {
  return new DoneToken(buildTokenData(status, curCmd, rowCount));
}

export class DoneProcTokenParser extends Map<[number, number, bigint | number], DoneProcToken> {
  constructor(options: { tdsVersion: string }) {
    if (options.tdsVersion < '7_2') {
      super(new Sequence<[number, number, number]>([new UInt16LE(), new UInt16LE(), new UInt32LE()]), buildDoneProcToken);
    } else {
      super(new Sequence<[number, number, bigint]>([new UInt16LE(), new UInt16LE(), new BigUInt64LE()]), buildDoneProcToken);
    }
  }
}

export class DoneInProcTokenParser extends Map<[number, number, bigint | number], DoneInProcToken> {
  constructor(options: { tdsVersion: string }) {
    if (options.tdsVersion < '7_2') {
      super(new Sequence<[number, number, number]>([new UInt16LE(), new UInt16LE(), new UInt32LE()]), buildDoneInProcToken);
    } else {
      super(new Sequence<[number, number, bigint]>([new UInt16LE(), new UInt16LE(), new BigUInt64LE()]), buildDoneInProcToken);
    }
  }
}

export class DoneTokenParser extends Map<[number, number, bigint | number], DoneToken> {
  constructor(options: { tdsVersion: string }) {
    if (options.tdsVersion < '7_2') {
      super(new Sequence<[number, number, number]>([new UInt16LE(), new UInt16LE(), new UInt32LE()]), buildDoneToken);
    } else {
      super(new Sequence<[number, number, bigint]>([new UInt16LE(), new UInt16LE(), new BigUInt64LE()]), buildDoneToken);
    }
  }
}

export function doneParser(parser: LegacyParser, options: ParserOptions, callback: (token: DoneToken) => void) {
  parser.execParser(DoneTokenParser, callback);
}

export function doneInProcParser(parser: LegacyParser, options: ParserOptions, callback: (token: DoneInProcToken) => void) {
  parser.execParser(DoneInProcTokenParser, callback);
}

export function doneProcParser(parser: LegacyParser, options: ParserOptions, callback: (token: DoneProcToken) => void) {
  parser.execParser(DoneProcTokenParser, callback);
}
