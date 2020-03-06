import Parser from './stream-parser';
import { ColumnMetadata } from './colmetadata-token-parser';
import { InternalConnectionOptions } from '../connection';

import { InfoMessageToken, ErrorMessageToken } from './token';

type TokenData = {
  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;
};

function parseToken(parser: Parser, options: InternalConnectionOptions, callback: (data: TokenData) => void) {
  // length
  parser.readUInt16LE(() => {
    parser.readUInt32LE((number) => {
      parser.readUInt8((state) => {
        parser.readUInt8((clazz) => {
          parser.readUsVarChar((message) => {
            parser.readBVarChar((serverName) => {
              parser.readBVarChar((procName) => {
                (options.tdsVersion < '7_2' ? parser.readUInt16LE : parser.readUInt32LE).call(parser, (lineNumber: number) => {
                  callback({
                    'number': number,
                    'state': state,
                    'class': clazz,
                    'message': message,
                    'serverName': serverName,
                    'procName': procName,
                    'lineNumber': lineNumber
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

export function infoParser(parser: Parser, _colMetadata: ColumnMetadata[], options: InternalConnectionOptions, callback: (token: InfoMessageToken) => void) {
  parseToken(parser, options, (data) => {
    callback(new InfoMessageToken(data));
  });
}

export function errorParser(parser: Parser, _colMetadata: ColumnMetadata[], options: InternalConnectionOptions, callback: (token: ErrorMessageToken) => void) {
  parseToken(parser, options, (data) => {
    callback(new ErrorMessageToken(data));
  });
}
