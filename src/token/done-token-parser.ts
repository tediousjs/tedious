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
