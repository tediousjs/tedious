// s2.2.7.14
import Parser, { ParserOptions } from './stream-parser';

import { OrderToken } from './token';

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

function parseToken(parser: Parser): OrderToken {
  offset = parser.position;

  const length = readUInt16LE(parser);
  const columnCount = length / 2;
  const orderColumns: number[] = [];

  for (let i = 0; i < columnCount; i++) {
    const column = readUInt16LE(parser);
    orderColumns.push(column);
  }

  parser.position = offset;
  return new OrderToken(orderColumns);
}

function orderParser(parser: Parser, _options: ParserOptions, callback: (token: OrderToken) => void) {
  let data!: OrderToken;
  try {
    data = parseToken(parser);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parser.suspend(() => {
        orderParser(parser, _options, callback);
      });
    }
  }
  callback(data);
}

export default orderParser;
module.exports = orderParser;
