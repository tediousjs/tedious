// s2.2.7.14
import Parser from './stream-parser';
import { ColumnMetadata } from './colmetadata-token-parser';
import { InternalConnectionOptions } from '../connection';

import { OrderToken } from './token';

function orderParser(parser: Parser, _colMetadata: ColumnMetadata[], _options: InternalConnectionOptions, callback: (token: OrderToken) => void) {
  parser.readUInt16LE((length) => {
    const columnCount = length / 2;
    const orderColumns: number[] = [];

    let i = 0;
    function next(done: () => void) {
      if (i === columnCount) {
        return done();
      }

      parser.readUInt16LE((column) => {
        orderColumns.push(column);

        i++;

        next(done);
      });
    }

    next(() => {
      callback(new OrderToken(orderColumns));
    });
  });
}

export default orderParser;
module.exports = orderParser;
