import Parser, { ParserOptions } from './stream-parser';
import BufferReader from './buffer-reader';
import { InfoMessageToken, ErrorMessageToken } from './token';

class NotEnoughDataError extends Error { }

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
  const br = new BufferReader(parser);
  br.readUInt16LE();
  const number = br.readUInt32LE();
  const state = br.readUInt8();
  const clazz = br.readUInt8();
  const message = br.readUsVarChar();
  const serverName = br.readBVarChar();
  const procName = br.readBVarChar();
  const lineNumber = options.tdsVersion < '7_2' ? br.readUInt16LE() : br.readUInt32LE();
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
