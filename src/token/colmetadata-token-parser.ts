import { readMetadata, type Metadata } from '../metadata-parser';

import Parser, { type ParserOptions } from './stream-parser';
import { ColMetadataToken } from './token';
import { NotEnoughDataError, Result, readBVarChar, readUInt16LE, readUInt8, readUsVarChar } from './helpers';

export interface ColumnMetadata extends Metadata {
  /**
   * The column's name。
   */
  colName: string;

  tableName?: string | string[] | undefined;
}

function readTableName(buf: Buffer, offset: number, metadata: Metadata, options: ParserOptions): Result<string | string[] | undefined> {
  if (!metadata.type.hasTableName) {
    return new Result(undefined, offset);
  }

  if (options.tdsVersion < '7_1') {
    return readUsVarChar(buf, offset);
  }

  let numberOfTableNameParts;
  ({ offset, value: numberOfTableNameParts } = readUInt8(buf, offset));

  const tableName: string[] = [];
  for (let i = 0; i < numberOfTableNameParts; i++) {
    let tableNamePart;
    ({ offset, value: tableNamePart } = readUsVarChar(buf, offset));

    tableName.push(tableNamePart);
  }

  return new Result(tableName, offset);
}

function readColumnName(buf: Buffer, offset: number, index: number, metadata: Metadata, options: ParserOptions): Result<string> {
  let colName;
  ({ offset, value: colName } = readBVarChar(buf, offset));

  if (options.columnNameReplacer) {
    return new Result(options.columnNameReplacer(colName, index, metadata), offset);
  } else if (options.camelCaseColumns) {
    return new Result(colName.replace(/^[A-Z]/, function(s) {
      return s.toLowerCase();
    }), offset);
  } else {
    return new Result(colName, offset);
  }
}

function readColumn(buf: Buffer, offset: number, options: ParserOptions, index: number) {
  let metadata;
  ({ offset, value: metadata } = readMetadata(buf, offset, options));

  let tableName;
  ({ offset, value: tableName } = readTableName(buf, offset, metadata, options));

  let colName;
  ({ offset, value: colName } = readColumnName(buf, offset, index, metadata, options));

  return new Result({
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
  }, offset);
}

async function colMetadataParser(parser: Parser): Promise<ColMetadataToken> {
  let columnCount;

  while (true) {
    let offset;

    try {
      ({ offset, value: columnCount } = readUInt16LE(parser.buffer, parser.position));
    } catch (err) {
      if (err instanceof NotEnoughDataError) {
        await parser.waitForChunk();
        continue;
      }

      throw err;
    }

    parser.position = offset;
    break;
  }

  const columns: ColumnMetadata[] = [];
  for (let i = 0; i < columnCount; i++) {
    while (true) {
      let column: ColumnMetadata;
      let offset;

      try {
        ({ offset, value: column } = readColumn(parser.buffer, parser.position, parser.options, i));
      } catch (err: any) {
        if (err instanceof NotEnoughDataError) {
          await parser.waitForChunk();
          continue;
        }

        throw err;
      }

      parser.position = offset;
      columns.push(column);

      break;
    }
  }

  return new ColMetadataToken(columns);
}

export default colMetadataParser;
module.exports = colMetadataParser;
