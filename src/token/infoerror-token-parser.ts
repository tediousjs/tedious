import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';

import { InfoMessageToken, ErrorMessageToken } from './token';

interface TokenData {
  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;
}

function parseToken(parser: Parser, options: InternalConnectionOptions, callback: (data: TokenData) => void) {
  const { buffer, position } = parser;

  if (buffer.length < position + 2) {
    return parser.suspend(() => {
      parseToken(parser, options, callback);
    });
  }

  const length = buffer.readUInt16LE(position);

  const data = buffer.slice(position + 2, position + 2 + length);

  let offset = 0;
  const number = data.readUInt32LE(offset);
  offset += 4;

  const state = data.readUInt8(offset);
  offset += 1;

  const clazz = data.readUInt8(offset);
  offset += 1;

  const messageLength = data.readUInt16LE(offset) * 2;
  offset += 2;
  const message = data.toString('ucs2', offset, offset += messageLength);

  const serverNameLength = data.readUInt8(offset) * 2;
  offset += 1;
  const serverName = data.toString('ucs2', offset, offset += serverNameLength);

  const procNameLength = data.readUInt8(offset);
  offset += 1;
  const procName = data.toString('ucs2', offset, offset += procNameLength * 2);

  let lineNumber;
  if (options.tdsVersion < '7_2') {
    lineNumber = data.readUInt16LE(offset);
    offset += 2;
  } else {
    lineNumber = data.readUInt32LE(offset);
    offset += 4;
  }

  parser.position += 2 + length;

  callback({
    'number': number,
    'state': state,
    'class': clazz,
    'message': message,
    'serverName': serverName,
    'procName': procName,
    'lineNumber': lineNumber
  });
}

export function infoParser(parser: Parser, options: InternalConnectionOptions, callback: (token: InfoMessageToken) => void) {
  parseToken(parser, options, (data) => {
    callback(new InfoMessageToken(data));
  });
}

export function errorParser(parser: Parser, options: InternalConnectionOptions, callback: (token: ErrorMessageToken) => void) {
  parseToken(parser, options, (data) => {
    callback(new ErrorMessageToken(data));
  });
}
