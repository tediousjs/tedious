// s2.2.7.17

import Parser from './stream-parser';
import { ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';

import valueParse from '../value-parser';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

async function rowParser(parser: Parser): Promise<RowToken> {
  const colMetadata = parser.colMetadata;
  const length = colMetadata.length;
  const columns: Column[] = [];

  for (let i = 0; i < length; i++) {
    const currColMetadata = colMetadata[i];
    let value;
    valueParse(parser, currColMetadata, parser.options, (v) => {
      value = v;
    });

    while (parser.suspended) {
      await parser.streamBuffer.waitForChunk();

      parser.suspended = false;
      const next = parser.next!;

      next();
    }
    columns.push({
      value,
      metadata: currColMetadata
    });
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
