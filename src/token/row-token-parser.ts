// s2.2.7.17

import Parser from './stream-parser';
import { ColumnMetadata } from './colmetadata-token-parser';
import { InternalConnectionOptions } from '../connection';

import { RowToken } from './token';

import valueParse from '../value-parser';
import { IncompleteError } from '../parser';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

function parseRow(parser: Parser, options: InternalConnectionOptions, columns: Column[], callback: (token: RowToken) => void) {
  const buffer = parser.buffer;
  const length = parser.colMetadata.length;
  let value;

  try {
    while (columns.length < length) {
      const metadata = parser.colMetadata[columns.length];
      ({ offset: parser.position, value } = valueParse(buffer, parser.position, metadata, options));
      columns.push({ metadata, value });
    }
  } catch (err) {
    if (err instanceof IncompleteError) {
      parser.suspend(() => {
        parseRow(parser, options, columns, callback);
      });
    }
  }

  if (options.useColumnNames) {
    const columnsMap: { [key: string]: Column } = {};

    columns.forEach((column) => {
      const colName = column.metadata.colName;
      if (columnsMap[colName] == null) {
        columnsMap[colName] = column;
      }
    });

    callback(new RowToken(columnsMap));
  } else {
    callback(new RowToken(columns));
  }
}

function rowParser(parser: Parser, options: InternalConnectionOptions, callback: (token: RowToken) => void) {
  parseRow(parser, options, [], callback);
}

export default rowParser;
module.exports = rowParser;
