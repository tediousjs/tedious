import type { BufferList } from 'bl/BufferList';
import { NotEnoughDataError, readBVarChar, readUInt16LE, readUInt32LE, readUInt8, readUsVarChar, type Result } from './helpers';
import { type ParserOptions } from './stream-parser';

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

function readToken(buf: Buffer | BufferList, offset: number, options: ParserOptions): Result<TokenData> {
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  let number;
  ({ offset, value: number } = readUInt32LE(buf, offset));

  let state;
  ({ offset, value: state } = readUInt8(buf, offset));

  let clazz;
  ({ offset, value: clazz } = readUInt8(buf, offset));

  let message;
  ({ offset, value: message } = readUsVarChar(buf, offset));

  let serverName;
  ({ offset, value: serverName } = readBVarChar(buf, offset));

  let procName;
  ({ offset, value: procName } = readBVarChar(buf, offset));

  let lineNumber;
  ({ offset, value: lineNumber } = options.tdsVersion < '7_2' ? readUInt16LE(buf, offset) : readUInt32LE(buf, offset));

  return {
    value: {
      'number': number,
      'state': state,
      'class': clazz,
      'message': message,
      'serverName': serverName,
      'procName': procName,
      'lineNumber': lineNumber
    },
    offset
  };
}

export function infoParser(buf: Buffer | BufferList, offset: number, options: ParserOptions): Result<InfoMessageToken> {
  let data;
  ({ offset, value: data } = readToken(buf, offset, options));

  return { value: new InfoMessageToken(data), offset };
}

export function errorParser(buf: Buffer | BufferList, offset: number, options: ParserOptions): Result<ErrorMessageToken> {
  let data;
  ({ offset, value: data } = readToken(buf, offset, options));

  return { value: new ErrorMessageToken(data), offset };
}
