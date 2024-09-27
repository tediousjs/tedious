// s2.2.7.17

import Parser from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';
// import * as iconv from 'iconv-lite';

import { readValue, readDecrypt } from '../value-parser';
// import { NotEnoughDataError } from './helpers';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

async function rowParser(parser: Parser): Promise<RowToken> {
  const columns: Column[] = [];
  for (const metadata of parser.colMetadata) {
    const result = await readDecrypt(parser, metadata, parser.options);
    columns.push({ value: result.value, metadata });
  }

  if (parser.options.useColumnNames) {
    const columnsMap: { [key: string]: Column } = Object.create(null);

    columns.forEach((column) => {
      const colName = column.metadata.colName;
      if (columnsMap[colName] == null) {
        columnsMap[colName] = column;
      }
    });

    return new RowToken(columnsMap);
  } else {
    return new RowToken(columns);
  }
}

export default rowParser;
module.exports = rowParser;
