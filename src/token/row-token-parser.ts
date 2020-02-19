// s2.2.7.17

import Parser from './stream-parser';
import { ColumnMetadata } from './colmetadata-token-parser';
import { InternalConnectionOptions } from '../connection';

import { RowToken } from './token';

import valueParse from '../value-parser';

type Column = {
  value: unknown;
  metadata: ColumnMetadata;
};

function rowParser(parser: Parser, colMetadata: ColumnMetadata[], options: InternalConnectionOptions, callback: (token: RowToken) => void) {
  const columns: Column[] = [];

  const len = colMetadata.length;
  let i = 0;

  function next(done: () => void) {
    if (i === len) {
      return done();
    }

    const columnMetaData = colMetadata[i];
    valueParse(parser, columnMetaData, options, (value) => {
      columns.push({
        value: value,
        metadata: columnMetaData
      });

      i++;

      next(done);
    });
  }

  next(() => {
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
  });
}

export default rowParser;
module.exports = rowParser;
