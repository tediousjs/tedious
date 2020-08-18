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

function readBigUInt64LE(buffer: Buffer, position: number) {
  const low = JSBI.BigInt(buffer.readUInt32LE(position));
  const high = JSBI.BigInt(buffer.readUInt32LE(position + 4));

  return JSBI.add(low, JSBI.leftShift(high, JSBI.BigInt(32)));
}

function parseToken70(parser: Parser, callback: (token: TokenData) => void) {
  const { buffer, position } = parser;

  if (buffer.length < position + 8) {
    return parser.suspend(() => {
      parseToken72(parser, callback);
    });
  }

  const status = buffer.readUInt16LE(position);
  const curCmd = buffer.readUInt16LE(position + 2);
  const rowCount = buffer.readUInt32LE(position + 4);

  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  parser.position += 8;

  callback({
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? rowCount : undefined,
    curCmd: curCmd
  });
}

function parseToken72(parser: Parser, callback: (token: TokenData) => void) {
  const { buffer, position } = parser;

  if (buffer.length < position + 12) {
    return parser.suspend(() => {
      parseToken72(parser, callback);
    });
  }

  const status = buffer.readUInt16LE(position);
  const curCmd = buffer.readUInt16LE(position + 2);
  const rowCount = JSBI.toNumber(readBigUInt64LE(buffer, position + 4));

  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  parser.position += 12;

  callback({
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? rowCount : undefined,
    curCmd: curCmd
  });
}

function parseToken(parser: Parser, options: InternalConnectionOptions, callback: (token: TokenData) => void) {
  if (options.tdsVersion < '7_2') {
    parseToken70(parser, callback);
  } else {
    parseToken72(parser, callback);
  }
}

export function doneParser(parser: Parser, options: InternalConnectionOptions, callback: (token: DoneToken) => void) {
  parseToken(parser, options, (data) => {
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
