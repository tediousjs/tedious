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

function* parseToken(parser, options) {
  const status = yield parser.readUInt16LE();
  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);
  const curCmd = yield parser.readUInt16LE();

  let rowCount;
  // If rowCount > 53 bits then rowCount will be incorrect (because Javascript uses IEEE_754 for number representation).
  if (options.tdsVersion < "7_2") {
    rowCount = yield parser.readUInt32LE();
  } else {
    rowCount = yield parser.readUInt64LE();
  }

  return {
    name: 'DONE',
    event: 'done',
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? rowCount : undefined,
    curCmd: curCmd
  };
}

export function* doneParser(parser, colMetadata, options) {
  const token = yield* parseToken(parser, options);
  token.name = 'DONE';
  token.event = 'done';
  return token;
}

export function* doneInProcParser(parser, colMetadata, options) {
  const token = yield* parseToken(parser, options);
  token.name = 'DONEINPROC';
  token.event = 'doneInProc';
  return token;
}

export function* doneProcParser(parser, colMetadata, options) {
  const token = yield* parseToken(parser, options);
  token.name = 'DONEPROC';
  token.event = 'doneProc';
  return token;
}
