// s2.2.7.14
import BufferReader from './buffer-reader';
import Parser, { ParserOptions } from './stream-parser';

import { OrderToken } from './token';

class NotEnoughDataError extends Error { }

function parseToken(parser: Parser): OrderToken {
  const br = new BufferReader(parser);

  const length = br.readUInt16LE();
  const columnCount = length / 2;
  const orderColumns: number[] = [];

  for (let i = 0; i < columnCount; i++) {
    const column = br.readUInt16LE();
    orderColumns.push(column);
  }

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
