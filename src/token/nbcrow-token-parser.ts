// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser, { ParserOptions } from './stream-parser';
import { ColumnMetadata } from './colmetadata-token-parser';

import { NBCRowToken } from './token';

import valueParse from '../value-parser';

function nullHandler(_parser: Parser, _columnMetadata: ColumnMetadata, _options: ParserOptions, callback: (value: unknown) => void) {
  callback(null);
}

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

async function nbcRowParser(parser: Parser): Promise<NBCRowToken> {
  const colMetadata = parser.colMetadata;
  const bitmapByteLength = Math.ceil(colMetadata.length / 8);
  const columns: Column[] = [];
  const bitmap: boolean[] = [];

  while (parser.buffer.length - parser.position < bitmapByteLength) {
    await parser.streamBuffer.waitForChunk();
  }

  const bytes = parser.buffer.slice(parser.position, parser.position + bitmapByteLength);
  parser.position += bitmapByteLength;

  for (let i = 0, len = bytes.length; i < len; i++) {
    const byte = bytes[i];

    bitmap.push(byte & 0b1 ? true : false);
    bitmap.push(byte & 0b10 ? true : false);
    bitmap.push(byte & 0b100 ? true : false);
    bitmap.push(byte & 0b1000 ? true : false);
    bitmap.push(byte & 0b10000 ? true : false);
    bitmap.push(byte & 0b100000 ? true : false);
    bitmap.push(byte & 0b1000000 ? true : false);
    bitmap.push(byte & 0b10000000 ? true : false);
  }

  for (let i = 0; i < colMetadata.length; i++) {
    const currColMetadata = colMetadata[i];
    let value;
    (bitmap[i] ? nullHandler : valueParse)(parser, currColMetadata, parser.options, (v) => {
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
    const columnsMap: { [key: string]: Column } = {};

    columns.forEach((column) => {
      const colName = column.metadata.colName;
      if (columnsMap[colName] == null) {
        columnsMap[colName] = column;
      }
    });

    return new NBCRowToken(columnsMap);
  } else {
    return new NBCRowToken(columns);
  }
}

export default nbcRowParser;
module.exports = nbcRowParser;
