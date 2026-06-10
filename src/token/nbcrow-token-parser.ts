// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { NBCRowToken } from './token';
import { decode } from '../iconv-helpers';

import { isPLPStream, readPLPStream, readPLPStreamSync, readValue } from '../value-parser';
import { NotEnoughDataError } from './helpers';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

function decodePLPColumn(metadata: ColumnMetadata, chunks: null | Buffer[]): unknown {
  if (chunks === null) {
    return null;
  } else if (metadata.type.name === 'NVarChar' || metadata.type.name === 'Xml') {
    return Buffer.concat(chunks).toString('ucs2');
  } else if (metadata.type.name === 'VarChar') {
    return decode(Buffer.concat(chunks), metadata.collation?.codepage ?? 'utf8');
  } else {
    // 'VarBinary' / 'UDT'
    return Buffer.concat(chunks);
  }
}

function buildNbcRowToken(parser: Parser, columns: Column[]): NBCRowToken {
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

/**
 * Parses a complete row from the already buffered data, without ever
 * suspending. Throws a `NotEnoughDataError` if the row is not fully buffered
 * yet - the parser position is only updated after the row was fully parsed.
 */
function parseNbcRowSync(parser: Parser): NBCRowToken {
  const colMetadata = parser.colMetadata;
  const length = colMetadata.length;
  const columns: Column[] = [];

  const buf = parser.buffer;
  let offset = parser.position;

  const bitmapByteLength = Math.ceil(length / 8);
  if (buf.length < offset + bitmapByteLength) {
    throw new NotEnoughDataError(offset + bitmapByteLength);
  }

  const bitmapStart = offset;
  offset += bitmapByteLength;

  for (let i = 0; i < length; i++) {
    const metadata = colMetadata[i];

    if ((buf[bitmapStart + (i >>> 3)] >>> (i & 0b111)) & 0b1) {
      columns.push({ value: null, metadata });
      continue;
    }

    if (isPLPStream(metadata)) {
      let chunks;
      ({ value: chunks, offset } = readPLPStreamSync(buf, offset));

      columns.push({ value: decodePLPColumn(metadata, chunks), metadata });
    } else {
      const result = readValue(buf, offset, metadata, parser.options);
      offset = result.offset;

      columns.push({ value: result.value, metadata });
    }
  }

  parser.position = offset;

  return buildNbcRowToken(parser, columns);
}

async function parseNbcRowAsync(parser: Parser): Promise<NBCRowToken> {
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

        columns.push({ value: decodePLPColumn(metadata, chunks), metadata });
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

  return buildNbcRowToken(parser, columns);
}

function nbcRowParser(parser: Parser): NBCRowToken | Promise<NBCRowToken> {
  try {
    return parseNbcRowSync(parser);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parseNbcRowAsync(parser);
    }

    throw err;
  }
}

export default nbcRowParser;
module.exports = nbcRowParser;
