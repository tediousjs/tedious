import { readMetadata, type Metadata } from '../metadata-parser';

import Parser, { type ParserOptions, type TokenReader } from './stream-parser';
import { ColMetadataToken } from './token';
import { Result, readBVarChar, readUInt16LE, readUInt8, readUsVarChar } from './helpers';

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

  if (options.tdsVersion < '7_2') {
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

/**
 * Reads a `COLMETADATA` token column by column, so that tokens describing many
 * columns are not parsed again from the start whenever they span chunks.
 */
export class ColMetadataTokenReader implements TokenReader {
  declare columnCount: number | undefined;
  declare columns: ColumnMetadata[];

  constructor() {
    this.columnCount = undefined;
    this.columns = [];
  }

  read(parser: Parser): ColMetadataToken {
    if (this.columnCount === undefined) {
      const { value, offset } = readUInt16LE(parser.buffer, parser.position);
      parser.position = offset;
      this.columnCount = value;
    }

    while (this.columns.length < this.columnCount) {
      const { value, offset } = readColumn(parser.buffer, parser.position, parser.options, this.columns.length);
      parser.position = offset;
      this.columns.push(value);
    }

    parser.colMetadata = this.columns;
    return new ColMetadataToken(this.columns);
  }
}
