// s2.2.7.14
import { UsVarbyte, Map } from '../parser';
import LegacyParser, { ParserOptions } from './stream-parser';

import { OrderToken } from './token';

class OrderTokenParser extends Map<Buffer, OrderToken> {
  constructor() {
    super(new UsVarbyte(), (buf) => {
      const orderColumns = [];

      for (let i = 0; i < buf.length; i += 2) {
        orderColumns.push(buf.readUInt16LE(i));
      }

      return new OrderToken(orderColumns);
    });
  }
}

function orderParser(parser: LegacyParser, _options: ParserOptions, callback: (token: OrderToken) => void) {
  parser.execParser(OrderTokenParser, callback);
}

export default orderParser;
module.exports = orderParser;
