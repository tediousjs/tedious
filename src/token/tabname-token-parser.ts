// s2.2.7.23
import { type ParserOptions } from './stream-parser';

import { TabNameToken } from './token';
import { NotEnoughDataError, readUInt16LE, readUInt8, readUsVarChar, Result } from './helpers';

function tabNameParser(buf: Buffer, offset: number, options: ParserOptions): Result<TabNameToken> {
  // length
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  const end = offset + tokenLength;
  const tableNames: (string | string[])[] = [];

  while (offset < end) {
    if (options.tdsVersion < '7_2') {
      let tableName;
      ({ offset, value: tableName } = readUsVarChar(buf, offset));

      tableNames.push(tableName);
    } else {
      let numberOfTableNameParts;
      ({ offset, value: numberOfTableNameParts } = readUInt8(buf, offset));

      const tableName: string[] = [];
      for (let i = 0; i < numberOfTableNameParts; i++) {
        let tableNamePart;
        ({ offset, value: tableNamePart } = readUsVarChar(buf, offset));

        tableName.push(tableNamePart);
      }

      tableNames.push(tableName);
    }
  }

  return new Result(new TabNameToken(tableNames), offset);
}

export default tabNameParser;
module.exports = tabNameParser;
