import metadataParse, { Metadata } from '../metadata-parser';

import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';
import { ColMetadataToken } from './token';

export interface ColumnMetadata extends Metadata {
  /**
   * The column's name。
   */
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

function readColumns(columnCount: number, parser: Parser, resolved: { val: boolean }, resolve: (arg0: ColMetadataToken) => void) {
  const columns: ColumnMetadata[] = [];

  for (let i = 0; i < columnCount; i++) {
    let column: ColumnMetadata;

    readColumn(parser, parser.options, i, (c) => {
      column = c;
    });

    if (!column!) {
      break;
    } else {
      columns.push(column!);
      if (i === columnCount - 1) {
        resolved.val = true;
        return resolve(new ColMetadataToken(columns));
      }
    }
  }
}

async function colMetadataParser(parser: Parser): Promise<ColMetadataToken> {
  while (parser.buffer.length - parser.position < 2) {
    await parser.streamBuffer.waitForChunk();
  }

  const columnCount = parser.buffer.readUInt16LE(parser.position);
  parser.position += 2;

  return new Promise((resolve) => {
    const parser_starting_position = parser.position;
    const resolved = { val: false };
    let whileLoopPaused = false;
    readColumns(columnCount, parser, resolved, resolve);

    if (!resolved.val) {
      while (parser.suspended && !whileLoopPaused) {
        parser.position = parser_starting_position;
        whileLoopPaused = true;
        parser.streamBuffer.waitForChunk().then(() => {
          parser.suspended = false;
          whileLoopPaused = false;
          readColumns(columnCount, parser, resolved, resolve);
        });
      }
    }
  });

}

export default colMetadataParser;
module.exports = colMetadataParser;
