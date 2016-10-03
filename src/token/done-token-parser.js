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

function readUInt64LE(offset, noAssert) {
  const low = this.readUInt32LE(offset, noAssert);
  const high = this.readUInt32LE(offset + 4, noAssert);

  if (high) {
    return Math.pow(2, 32) * high + low;
  } else {
    return low;
  }
}

function parseToken(name, event) {
  let status, curCmd, rowCount;
  if (this.options.tdsVersion < '7_2') {
    if (!this.bytesAvailable(8)) {
      return;
    }

    status = this.readUInt16LE();
    curCmd = this.readUInt16LE(2);
    rowCount = this.readUInt32LE(4);

    this.consumeBytes(8);
  } else {
    if (!this.bytesAvailable(12)) {
      return;
    }

    status = this.readUInt16LE();
    curCmd = this.readUInt16LE(2);
    rowCount = readUInt64LE.call(this.buffer, this.position, true);

    this.consumeBytes(12);
  }

  const more = !!(status & STATUS.MORE);
  const sqlError = !!(status & STATUS.ERROR);
  const rowCountValid = !!(status & STATUS.COUNT);
  const attention = !!(status & STATUS.ATTN);
  const serverError = !!(status & STATUS.SRVERROR);

  this.push({
    name: name,
    event: event,
    more: more,
    sqlError: sqlError,
    attention: attention,
    serverError: serverError,
    rowCount: rowCountValid ? rowCount : undefined,
    curCmd: curCmd
  });

  return this.parseNextToken;
}

module.exports.doneParser = doneParser;
function doneParser() {
  return parseToken.call(this, 'DONE', 'done');
}

module.exports.doneInProcParser = doneInProcParser;
function doneInProcParser() {
  return parseToken.call(this, 'DONEINPROC', 'doneInProc');
}

module.exports.doneProcParser = doneProcParser;
function doneProcParser() {
  return parseToken.call(this, 'DONEPROC', 'doneProc');
}
