import Parser, { ParserOptions } from './stream-parser';

import { LoginAckToken } from './token';

import { versionsByValue as versions } from '../tds-versions';

class NotEnoughDataError extends Error { }

const interfaceTypes: { [key: number]: string } = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

let offset: number;

function checkDataLength(buffer: Buffer, numBytes: number): void {
  if (buffer.length < offset + numBytes) {
    throw new NotEnoughDataError();
  }
}

function readUInt16LE(parser: Parser): number {
  const numBytes = 2;
  checkDataLength(parser.buffer, numBytes);
  const data = parser.buffer.readUInt16LE(offset);
  offset += numBytes;
  return data;
}

function readUInt8(parser: Parser): number {
  const numBytes = 1;
  checkDataLength(parser.buffer, numBytes);
  const data = parser.buffer.readUInt8(offset);
  offset += numBytes;
  return data;
}

function readUInt32BE(parser: Parser): number {
  const numBytes = 4;
  checkDataLength(parser.buffer, numBytes);
  const data = parser.buffer.readUInt32BE(offset);
  offset += numBytes;
  return data;
}

function readBVarChar(parser: Parser): string {
  const numBytes = readUInt8(parser) * 2;
  const data = readFromBuffer(parser, numBytes).toString('ucs2');
  return data;
}

function readFromBuffer(parser: Parser, numBytes: number): Buffer {
  checkDataLength(parser.buffer, numBytes);
  const result = parser.buffer.slice(offset, offset + numBytes);
  offset += numBytes;
  return result;
}

function parseToken(parser: Parser): LoginAckToken {
  offset = parser.position;
  readUInt16LE(parser);
  const interfaceNumber = readUInt8(parser);
  const interfaceType = interfaceTypes[interfaceNumber];
  const tdsVersionNumber = readUInt32BE(parser);
  const tdsVersion = versions[tdsVersionNumber];
  const progName = readBVarChar(parser);
  const major = readUInt8(parser);
  const minor = readUInt8(parser);
  const buildNumHi = readUInt8(parser);
  const buildNumLow = readUInt8(parser);

  parser.position = offset;

  return new LoginAckToken({
    interface: interfaceType,
    tdsVersion: tdsVersion,
    progName: progName,
    progVersion: {
      major: major,
      minor: minor,
      buildNumHi: buildNumHi,
      buildNumLow: buildNumLow
    }
  });
}

function loginAckParser(parser: Parser, _options: ParserOptions, callback: (token: LoginAckToken) => void) {
  let data!: LoginAckToken;
  try {
    data = parseToken(parser);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        loginAckParser(parser, _options, callback);
      });
    }
  }

  callback(data);
}

export default loginAckParser;
module.exports = loginAckParser;
