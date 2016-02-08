'use strict';

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

function parseToken(parser, options, callback) {
  parser.readUInt16LE((status) => {
    const more = !!(status & STATUS.MORE);
    const sqlError = !!(status & STATUS.ERROR);
    const rowCountValid = !!(status & STATUS.COUNT);
    const attention = !!(status & STATUS.ATTN);
    const serverError = !!(status & STATUS.SRVERROR);

    parser.readUInt16LE((curCmd) => {
      (options.tdsVersion < '7_2' ? parser.readUInt32LE : parser.readUInt64LE).call(parser, (rowCount) => {
        callback({
          name: 'DONE',
          event: 'done',
          more: more,
          sqlError: sqlError,
          attention: attention,
          serverError: serverError,
          rowCount: rowCountValid ? rowCount : undefined,
          curCmd: curCmd
        });
      });
    });
  });
}

module.exports.doneParser = doneParser;
function doneParser(parser, colMetadata, options, callback) {
  parseToken(parser, options, (token) => {
    token.name = 'DONE';
    token.event = 'done';
    callback(token);
  });
}

module.exports.doneInProcParser = doneInProcParser;
function doneInProcParser(parser, colMetadata, options, callback) {
  parseToken(parser, options, (token) => {
    token.name = 'DONEINPROC';
    token.event = 'doneInProc';
    callback(token);
  });
}

module.exports.doneProcParser = doneProcParser;
function doneProcParser(parser, colMetadata, options, callback) {
  parseToken(parser, options, (token) => {
    token.name = 'DONEPROC';
    token.event = 'doneProc';
    callback(token);
  });
}
