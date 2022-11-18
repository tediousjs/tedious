import { BVarchar, Map, Record, UInt16LE, UInt32LE, UInt8, UsVarbyte, UsVarchar } from '../parser';
import Parser, { ParserOptions } from './stream-parser';

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

class TokenDataParser extends Record<TokenData> {
  constructor(options: ParserOptions) {
    super({
      number: new UInt32LE(),
      state: new UInt8(),
      class: new UInt8(),
      message: new UsVarchar(),
      serverName: new BVarchar(),
      procName: new BVarchar(),
      lineNumber: options.tdsVersion < '7_2' ? new UInt16LE() : new UInt32LE()
    });
  }
}

function parseTokenData(buffer: Buffer, options: ParserOptions) {
  const parser = new TokenDataParser(options);
  const result = parser.parse(buffer, 0);

  if (!result.done || result.offset !== buffer.length) {
    throw new Error('Parsing error');
  }

  return result.value;
}
class InfoMessageTokenParser extends Map<Buffer, InfoMessageToken> {
  constructor(options: ParserOptions) {
    super(new UsVarbyte(), (buffer) => {
      return new InfoMessageToken(parseTokenData(buffer, options));
    });
  }
}

class ErrorMessageTokenParser extends Map<Buffer, ErrorMessageToken> {
  constructor(options: ParserOptions) {
    super(new UsVarbyte(), (buffer) => {
      return new ErrorMessageToken(parseTokenData(buffer, options));
    });
  }
}

export function infoParser(parser: Parser, options: ParserOptions, callback: (token: InfoMessageToken) => void) {
  parser.execParser(InfoMessageTokenParser, callback);
}

export function errorParser(parser: Parser, options: ParserOptions, callback: (token: ErrorMessageToken) => void) {
  parser.execParser(ErrorMessageTokenParser, callback);
}
