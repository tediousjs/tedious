// s2.2.7.6
import { type ParserOptions } from './stream-parser';

import { ColInfoToken, type ColumnInfo } from './token';
import { NotEnoughDataError, readBVarChar, readUInt16LE, readUInt8, Result } from './helpers';

const STATUS = {
  EXPRESSION: 0x04,
  KEY: 0x08,
  HIDDEN: 0x10,
  DIFFERENT_NAME: 0x20
};

function colInfoParser(buf: Buffer, offset: number, _options: ParserOptions): Result<ColInfoToken> {
  // length
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  const end = offset + tokenLength;
  const columns: ColumnInfo[] = [];

  while (offset < end) {
    let colNum;
    ({ offset, value: colNum } = readUInt8(buf, offset));

    let tableNum;
    ({ offset, value: tableNum } = readUInt8(buf, offset));

    let status;
    ({ offset, value: status } = readUInt8(buf, offset));

    let colName;
    if (status & STATUS.DIFFERENT_NAME) {
      ({ offset, value: colName } = readBVarChar(buf, offset));
    }

    columns.push({
      colNum: colNum,
      tableNum: tableNum,
      expression: !!(status & STATUS.EXPRESSION),
      key: !!(status & STATUS.KEY),
      hidden: !!(status & STATUS.HIDDEN),
      colName: colName
    });
  }

  return new Result(new ColInfoToken(columns), offset);
}

export default colInfoParser;
module.exports = colInfoParser;
