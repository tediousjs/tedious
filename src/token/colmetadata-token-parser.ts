import metadataParse, { Metadata } from '../metadata-parser';

import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';
import { ColMetadataToken } from './token';

export interface ColumnMetadata extends Metadata {
  colName: string;
  tableName?: string | string[];
}

function readTableName(parser: Parser, options: InternalConnectionOptions, metadata: Metadata, callback: (tableName?: string | string[]) => void) {
  if (metadata.type.hasTableName) {
    if (options.tdsVersion >= '7_2') {
      parser.readUInt8((numberOfTableNameParts) => {
        const tableName: string[] = [];

        let i = 0;
        function next(done: () => void) {
          if (numberOfTableNameParts === i) {
            return done();
          }

          parser.readUsVarChar((part) => {
            tableName.push(part);

            i++;

            next(done);
          });
        }

        next(() => {
          callback(tableName);
        });
      });
    } else {
      parser.readUsVarChar(callback);
    }
  } else {
    callback(undefined);
  }
}

function readColumnName(parser: Parser, options: InternalConnectionOptions, index: number, metadata: Metadata, callback: (colName: string) => void) {
  parser.readBVarChar((colName) => {
    if (options.columnNameReplacer) {
      callback(options.columnNameReplacer(colName, index, metadata));
    } else if (options.camelCaseColumns) {
      callback(colName.replace(/^[A-Z]/, function(s) {
        return s.toLowerCase();
      }));
    } else {
      callback(colName);
    }
  });
}

function readColumn(parser: Parser, options: InternalConnectionOptions, index: number, callback: (column: ColumnMetadata) => void) {
  metadataParse(parser, options, (metadata) => {
    readTableName(parser, options, metadata, (tableName) => {
      readColumnName(parser, options, index, metadata, (colName) => {
        callback({
          userType: metadata.userType,
          flags: metadata.flags,
          type: metadata.type,
          collation: metadata.collation,
          precision: metadata.precision,
          scale: metadata.scale,
          udtInfo: metadata.udtInfo,
          dataLength: metadata.dataLength,
          schema: metadata.schema,
          colName: colName,
          tableName: tableName
        });
      });
    });
  });
}

function colMetadataParser(parser: Parser, options: InternalConnectionOptions, callback: (token: ColMetadataToken) => void) {
  parser.readUInt16LE((columnCount) => {
    const columns: ColumnMetadata[] = [];

    let i = 0;
    function next(done: () => void) {
      if (i === columnCount) {
        return done();
      }

      readColumn(parser, options, i, (column) => {
        columns.push(column);

        i++;
        next(done);
      });
    }

    next(() => {
      callback(new ColMetadataToken(columns));
    });
  });
}

export default colMetadataParser;
module.exports = colMetadataParser;
