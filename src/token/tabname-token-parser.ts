// s2.2.7.23
import { type ParserOptions } from './stream-parser';

import { TabNameToken } from './token';
import { NotEnoughDataError, readUInt16LE, readUInt8, readUsVarChar, Result } from './helpers';

function tabNameParser(buf: Buffer, offset: number, _options: ParserOptions): Result<TabNameToken> {
  // length
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  const end = offset + tokenLength;
  const tableNames: string[][] = [];

  // Table names are sent as their individual parts. (While TDS versions
  // before 7.1 Revision 1 sent each name as a single string, all servers
  // that speak TDS 7.1 or newer use the multi-part format.)
  while (offset < end) {
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

  if (offset !== end) {
    throw new Error('Malformed TABNAME token');
  }

  return new Result(new TabNameToken(tableNames), offset);
}

export default tabNameParser;
module.exports = tabNameParser;
