// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { NBCRowToken } from './token';
import * as iconv from 'iconv-lite';

import { isPLPStream, readPLPStream, readValue } from '../value-parser';
import { NotEnoughDataError } from './helpers';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

async function nbcRowParser(parser: Parser): Promise<NBCRowToken> {
  const colMetadata = parser.colMetadata;
  const columns: Column[] = [];
  const bitmap: boolean[] = [];
  const bitmapByteLength = Math.ceil(colMetadata.length / 8);

  while (parser.buffer.length - parser.position < bitmapByteLength) {
    await parser.waitForChunk();
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
    const metadata = colMetadata[i];
    if (bitmap[i]) {
      columns.push({ value: null, metadata });
      continue;
    }

    while (true) {
      if (isPLPStream(metadata)) {
        const chunks = await readPLPStream(parser);

        if (chunks === null) {
          columns.push({ value: chunks, metadata });
        } else if (metadata.type.name === 'NVarChar' || metadata.type.name === 'Xml') {
          columns.push({ value: Buffer.concat(chunks).toString('ucs2'), metadata });
        } else if (metadata.type.name === 'VarChar') {
          columns.push({ value: iconv.decode(Buffer.concat(chunks), metadata.collation?.codepage ?? 'utf8'), metadata });
        } else if (metadata.type.name === 'VarBinary' || metadata.type.name === 'UDT') {
          columns.push({ value: Buffer.concat(chunks), metadata });
        }
      } else {
        let result;
        try {
          result = readValue(parser.buffer, parser.position, metadata, parser.options);
        } catch (err) {
          if (err instanceof NotEnoughDataError) {
            await parser.waitForChunk();
            continue;
          }

          throw err;
        }

        parser.position = result.offset;
        columns.push({ value: result.value, metadata });
      }

      break;
    }
  }

  if (parser.options.useColumnNames) {
    const columnsMap: { [key: string]: Column } = Object.create(null);

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
