'use strict';

// s2.2.7.5/6/7

var STATUS = {
  MORE: 0x0001,
  ERROR: 0x0002,
  // This bit is not yet in use by SQL Server, so is not exposed in the returned token
  INXACT: 0x0004,
  COUNT: 0x0010,
  ATTN: 0x0020,
  SRVERROR: 0x0100
};

function parseToken(parser, options, callback) {
  parser.readUInt16LE(function (status) {
    var more = !!(status & STATUS.MORE);
    var sqlError = !!(status & STATUS.ERROR);
    var rowCountValid = !!(status & STATUS.COUNT);
    var attention = !!(status & STATUS.ATTN);
    var serverError = !!(status & STATUS.SRVERROR);

    parser.readUInt16LE(function (curCmd) {
      (options.tdsVersion < '7_2' ? parser.readUInt32LE : parser.readUInt64LE).call(parser, function (rowCount) {
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
  parseToken(parser, options, function (token) {
    token.name = 'DONE';
    token.event = 'done';
    callback(token);
  });
}

module.exports.doneInProcParser = doneInProcParser;
function doneInProcParser(parser, colMetadata, options, callback) {
  parseToken(parser, options, function (token) {
    token.name = 'DONEINPROC';
    token.event = 'doneInProc';
    callback(token);
  });
}

module.exports.doneProcParser = doneProcParser;
function doneProcParser(parser, colMetadata, options, callback) {
  parseToken(parser, options, function (token) {
    token.name = 'DONEPROC';
    token.event = 'doneProc';
    callback(token);
  });
}