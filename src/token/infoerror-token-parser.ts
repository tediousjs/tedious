import Parser, { ParserOptions } from './stream-parser';

import { InfoMessageToken, ErrorMessageToken } from './token';

class NotEnoughDataError extends Error { }
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

function readUInt32LE(parser: Parser): number {
  const numBytes = 4;
  checkDataLength(parser.buffer, numBytes);
  const data = parser.buffer.readUInt32LE(offset);
  offset += numBytes;
  return data;
}

function readBVarChar(parser: Parser): string {
  const numBytes = readUInt8(parser) * 2;
  const data = readFromBuffer(parser, numBytes).toString('ucs2');
  return data;
}


function readUsVarChar(parser: Parser): string {
  const numBytes = readUInt16LE(parser) * 2;
  const data = readFromBuffer(parser, numBytes).toString('ucs2');
  return data;
}

function readFromBuffer(parser: Parser, numBytes: number): Buffer {
  checkDataLength(parser.buffer, numBytes);
  const result = parser.buffer.slice(offset, offset + numBytes);
  offset += numBytes;
  return result;
}

interface TokenData {
  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;
}

function parseToken(parser: Parser, options: ParserOptions): TokenData {
  // length
  offset = parser.position;
  readUInt16LE(parser);
  const number = readUInt32LE(parser);
  const state = readUInt8(parser);
  const clazz = readUInt8(parser);
  const message = readUsVarChar(parser);
  const serverName = readBVarChar(parser);
  const procName = readBVarChar(parser);
  const lineNumber = options.tdsVersion < '7_2' ? readUInt16LE(parser) : readUInt32LE(parser);
  parser.position = offset;
  return {
    'number': number,
    'state': state,
    'class': clazz,
    'message': message,
    'serverName': serverName,
    'procName': procName,
    'lineNumber': lineNumber
  } as TokenData;
}

export function infoParser(parser: Parser, options: ParserOptions, callback: (token: InfoMessageToken) => void) {
  let data!: TokenData;
  try {
    data = parseToken(parser, options);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        infoParser(parser, options, callback);
      });
    }
  }

  callback(new InfoMessageToken(data));
}

export function errorParser(parser: Parser, options: ParserOptions, callback: (token: ErrorMessageToken) => void) {
  let data!: TokenData;
  try {
    data = parseToken(parser, options);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        errorParser(parser, options, callback);
      });
    }
  }

  callback(new ErrorMessageToken(data));
}
