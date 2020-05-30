// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser from './stream-parser';
import { ColumnMetadata } from './colmetadata-token-parser';
import { InternalConnectionOptions } from '../connection';

import { NBCRowToken } from './token';

import valueParse from '../value-parser';

function nullHandler(_parser: Parser, _columnMetadata: ColumnMetadata, _options: InternalConnectionOptions, callback: (value: unknown) => void) {
  callback(null);
}

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

function nbcRowParser(parser: Parser, options: InternalConnectionOptions, callback: (token: NBCRowToken) => void) {
  const columnsMetaData = parser.colMetadata;
  const length = Math.ceil(columnsMetaData.length / 8);
  parser.readBuffer(length, (bytes) => {
    const bitmap: boolean[] = [];

    for (let i = 0, len = bytes.length; i < len; i++) {
      const byte = bytes[i];
      for (let j = 0; j <= 7; j++) {
        bitmap.push(byte & (1 << j) ? true : false);
      }
    }

    const columns: Column[] = [];
    const len = columnsMetaData.length;
    let i = 0;

    function next(done: () => void) {
      if (i === len) {
        return done();
      }

      const columnMetaData = columnsMetaData[i];

      (bitmap[i] ? nullHandler : valueParse)(parser, columnMetaData, options, (value) => {
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

        callback(new NBCRowToken(columnsMap));
      } else {
        callback(new NBCRowToken(columns));
      }
    });
  });
}

export default nbcRowParser;
module.exports = nbcRowParser;
