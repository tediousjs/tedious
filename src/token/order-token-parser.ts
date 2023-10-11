// s2.2.7.14
import { type ParserOptions } from './stream-parser';

import { OrderToken } from './token';
import { NotEnoughDataError, readUInt16LE, type Result } from './helpers';

function orderParser(buf: Buffer, offset: number, _options: ParserOptions): Result<OrderToken> {
  // length
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  const orderColumns: number[] = [];

  for (let i = 0; i < tokenLength; i += 2) {
    let column;
    ({ offset, value: column } = readUInt16LE(buf, offset));

    orderColumns.push(column);
  }

  return { value: new OrderToken(orderColumns), offset };
}

export default orderParser;
module.exports = orderParser;
