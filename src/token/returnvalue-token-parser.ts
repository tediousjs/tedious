// s2.2.7.16

import Parser, { type ParserOptions } from './stream-parser';

import { ReturnValueToken } from './token';

import metadataParse, { Metadata } from '../metadata-parser';
import valueParse from '../value-parser';

class NotEnoughDataError extends Error { }

function returnParser(parser: Parser, options: ParserOptions, callback: (token: ReturnValueToken) => void) {
  parser.readUInt16LE((paramOrdinal) => {
    parser.readBVarChar((paramName) => {
      if (paramName.charAt(0) === '@') {
        paramName = paramName.slice(1);
      }
      parser.position += 1;
      // status
      readValue(parser, options, paramOrdinal, paramName, parser.position, callback);

    });
  });
}

function readValue(parser: Parser, options: ParserOptions, paramOrdinal: number, paramName: string, originalPosition: number, callback: (token: ReturnValueToken) => void) {
  let metadata!: Metadata;
  parser.position = originalPosition;
  try {
    metadata = metadataParse(parser, options);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        readValue(parser, options, paramOrdinal, paramName, originalPosition, callback);
      });
    }
  }
  valueParse(parser, metadata, options, (value) => {
    callback(new ReturnValueToken({
      paramOrdinal: paramOrdinal,
      paramName: paramName,
      metadata: metadata,
      value: value
    }));
  });
}

export default returnParser;
module.exports = returnParser;
