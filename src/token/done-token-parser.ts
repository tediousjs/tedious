import Parser, { ParserOptions } from './stream-parser';
import { DoneToken, DoneInProcToken, DoneProcToken } from './token';

import { BigUInt64LE, Sequence, UInt16LE, UInt32LE, Map, Parser as P } from '../parser';

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

function execParser<T extends DoneTokenParser | DoneProcTokenParser | DoneInProcTokenParser>(parser: Parser, options: ParserOptions, parserConstructor: { new(options: ParserOptions): T }, callback: (token: T extends P<infer O> ? O : never) => void) {
  const p = new parserConstructor(options);

  const next = () => {
    const result = p.parse(parser.buffer, parser.position);
    parser.position = result.offset;

    if (result.done) {
      return callback(result.value as T extends P<infer O> ? O : never);
    }

    parser.suspend(next);
  };

  next();
}

export function doneParser(parser: Parser, options: ParserOptions, callback: (token: DoneToken) => void) {
  execParser(parser, options, DoneTokenParser, callback);
}

export function doneInProcParser(parser: Parser, options: ParserOptions, callback: (token: DoneInProcToken) => void) {
  execParser(parser, options, DoneInProcTokenParser, callback);
}

export function doneProcParser(parser: Parser, options: ParserOptions, callback: (token: DoneProcToken) => void) {
  execParser(parser, options, DoneProcTokenParser, callback);
}
