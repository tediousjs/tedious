// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { NBCRowToken } from './token';
import * as iconv from 'iconv-lite';

import { isPLPStream, readPLPStream, readPLPStreamAsync, readValue } from '../value-parser';
import { NotEnoughDataError } from './helpers';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

function decodePLPValue(chunks: Buffer[], metadata: ColumnMetadata): unknown {
  switch (metadata.type.name) {
    case 'NVarChar':
    case 'Xml':
      return (chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)).toString('ucs2');

    case 'VarChar':
      return iconv.decode(chunks.length === 1 ? chunks[0] : Buffer.concat(chunks), metadata.collation?.codepage ?? 'utf8');

    default: // 'VarBinary' | 'UDT'
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
 * Parse a row from the data that is currently buffered. Throws a
 * `NotEnoughDataError` if the buffer does not contain the full row.
 */
function readNbcRow(parser: Parser): NBCRowToken {
  const colMetadata = parser.colMetadata;
  const columns: Column[] = new Array(colMetadata.length);
  const bitmapByteLength = Math.ceil(colMetadata.length / 8);

  const buf = parser.buffer;
  const bitmapOffset = parser.position;

  if (buf.length < bitmapOffset + bitmapByteLength) {
    throw new NotEnoughDataError(bitmapOffset + bitmapByteLength);
  }

  parser.position += bitmapByteLength;

  for (let i = 0; i < colMetadata.length; i++) {
    const metadata = colMetadata[i];

    if (buf[bitmapOffset + (i >>> 3)] & (1 << (i & 0b111))) {
      columns[i] = { value: null, metadata };
      continue;
    }

    let value;
    if (isPLPStream(metadata)) {
      const result = readPLPStream(parser.buffer, parser.position);
      parser.position = result.offset;
      value = result.value === null ? null : decodePLPValue(result.value, metadata);
    } else {
      const result = readValue(parser.buffer, parser.position, metadata, parser.options);
      parser.position = result.offset;
      value = result.value;
    }

    columns[i] = { value, metadata };
  }

  return buildNbcRowToken(parser, columns);
}

/**
 * Parse a row, waiting for more data to arrive as necessary. Unlike
 * `readNbcRow`, this can incrementally consume rows that are larger than
 * the parser's current buffer.
 */
async function readNbcRowAsync(parser: Parser): Promise<NBCRowToken> {
  const colMetadata = parser.colMetadata;
  const columns: Column[] = [];
  const bitmapByteLength = Math.ceil(colMetadata.length / 8);

  while (parser.buffer.length - parser.position < bitmapByteLength) {
    await parser.waitForChunk();
  }

  const bytes = parser.buffer.slice(parser.position, parser.position + bitmapByteLength);
  parser.position += bitmapByteLength;

  for (let i = 0; i < colMetadata.length; i++) {
    const metadata = colMetadata[i];
    if (bytes[i >>> 3] & (1 << (i & 0b111))) {
      columns.push({ value: null, metadata });
      continue;
    }

    while (true) {
      if (isPLPStream(metadata)) {
        const chunks = await readPLPStreamAsync(parser);

        columns.push({ value: chunks === null ? null : decodePLPValue(chunks, metadata), metadata });
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
  const startPosition = parser.position;

  try {
    return readNbcRow(parser);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      // The full row was not yet buffered. Fall back to the incremental
      // parser, restarting at the beginning of the row.
      parser.position = startPosition;
      return readNbcRowAsync(parser);
    }

    throw err;
  }
}

export default nbcRowParser;
module.exports = nbcRowParser;
