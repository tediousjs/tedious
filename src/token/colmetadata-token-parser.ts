import metadataParse, { Metadata } from '../metadata-parser';

import { InternalConnectionOptions } from '../connection';
import { ColMetadataToken } from './token';
import { bVarChar, Result, usVarChar, uInt8, uInt16LE, wrap } from '../parser';

export interface ColumnMetadata extends Metadata {
  /**
   * The column's name。
   */
  colName: string;

  tableName?: string | string[];
}

function readTableName(buffer: Buffer, offset: number, options: InternalConnectionOptions, metadata: Metadata): Result<string | string[] | undefined> {
  if (metadata.type.hasTableName) {
    if (options.tdsVersion >= '7_2') {
      let numberOfTableNameParts;
      ({ offset, value: numberOfTableNameParts } = uInt8(buffer, offset));

      const tableName = [];
      while (tableName.length < numberOfTableNameParts) {
        let tableNamePart;
        ({ offset, value: tableNamePart } = usVarChar(buffer, offset));
        tableName.push(tableNamePart);
      }

      return new Result(offset, tableName);
    } else {
      return usVarChar(buffer, offset);
    }
  } else {
    return new Result(offset, undefined);
  }
}

function readColumnName(buffer: Buffer, offset: number, options: InternalConnectionOptions, index: number, metadata: Metadata): Result<string> {
  let colName;
  ({ offset, value: colName } = bVarChar(buffer, offset));

  if (options.columnNameReplacer) {
    return new Result(offset, options.columnNameReplacer(colName, index, metadata));
  }

  if (options.camelCaseColumns) {
    return new Result(offset, colName.replace(/^[A-Z]/, function(s) {
      return s.toLowerCase();
    }));
  }

  return new Result(offset, colName);
}

function readColumn(buffer: Buffer, offset: number, options: InternalConnectionOptions, index: number) {
  let metadata;
  ({ offset, value: metadata } = metadataParse(buffer, offset, options));

  let tableName;
  ({ offset, value: tableName } = readTableName(buffer, offset, options, metadata));

  let colName;
  ({ offset, value: colName } = readColumnName(buffer, offset, options, index, metadata));

  return new Result(offset, {
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
}

const colMetadataParser = wrap(function colMetadataParser(buffer, offset, { options }) {
  const columns: ColumnMetadata[] = [];

  let columnCount;
  ({ offset, value: columnCount } = uInt16LE(buffer, offset));

  while (columns.length < columnCount) {
    let column;
    ({ offset, value: column } = readColumn(buffer, offset, options, columns.length));
    columns.push(column);
  }

  return new Result(offset, new ColMetadataToken(columns));
});

export default colMetadataParser;
module.exports = colMetadataParser;
