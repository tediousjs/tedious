import { BigUInt64LE, Sequence, UInt16LE, UInt32LE, Map } from '..';
import { DoneProcToken } from '../../token/token';

const STATUS = {
  MORE: 0x0001,
  ERROR: 0x0002,
  // This bit is not yet in use by SQL Server, so is not exposed in the returned token
  INXACT: 0x0004,
  COUNT: 0x0010,
  ATTN: 0x0020,
  SRVERROR: 0x0100
};

function buildDoneProcToken([status, curCmd, rowCount]: [number, number, bigint | number]): DoneProcToken {
  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  return new DoneProcToken({
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? Number(rowCount) : undefined,
    curCmd: curCmd
  });
}

export class DoneProcTokenParser extends Map<[number, number, bigint | number], DoneProcToken> {
  constructor(options: { tdsVersion: string }) {
    if (options.tdsVersion === '7_4') {
      super(new Sequence<[number, number, bigint]>([new UInt16LE(), new UInt16LE(), new BigUInt64LE()]), buildDoneProcToken);
    } else {
      super(new Sequence<[number, number, number]>([new UInt16LE(), new UInt16LE(), new UInt32LE()]), buildDoneProcToken);
    }
  }
}
