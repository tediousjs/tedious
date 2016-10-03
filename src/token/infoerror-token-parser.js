'use strict';

function parseToken(name, event) {
  if (!this.bytesAvailable(2)) {
    return;
  }

  const length = this.readUInt16LE();

  if (!this.bytesAvailable(2 + length)) {
    return;
  }

  const number = this.readUInt32LE(2);
  const state = this.readUInt8(6);
  const clazz = this.readUInt8(7);

  this.consumeBytes(8);

  const messageLength = this.readUInt16LE();
  const message = this.buffer.toString('ucs2', this.position + 2, this.position + 2 + messageLength);

  this.consumeBytes(2 + messageLength);

  const serverNameLength = this.readUInt8();
  const serverName = this.buffer.toString('ucs2', this.position + 1, this.position + 1 + serverNameLength);

  this.consumeBytes(1 + serverNameLength);

  const procNameLength = this.readUInt8();
  const procName = this.buffer.toString('ucs2', this.position + 1, this.position + 1 + procNameLength);

  this.consumeBytes(1 + procNameLength);

  const lineNumber = this.options.tdsVersion < '7_2' ? this.readUInt16LE() : this.readUInt32LE();

  this.push({
    'name': name,
    'event': event,
    'number': number,
    'state': state,
    'class': clazz,
    'message': message,
    'serverName': serverName,
    'procName': procName,
    'lineNumber': lineNumber
  });

  return this.parseNextToken;
}

module.exports.infoParser = infoParser;
function infoParser() {
  return parseToken.call(this, 'INFO', 'infoMessage');
}

module.exports.errorParser = errorParser;
function errorParser() {
  return parseToken.call(this, 'ERROR', 'errorMessage');
}
