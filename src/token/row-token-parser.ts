// s2.2.7.17

import Parser from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';
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

function buildRowToken(parser: Parser, columns: Column[]): RowToken {
  if (parser.options.useColumnNames) {
    const columnsMap: { [key: string]: Column } = Object.create(null);

    columns.forEach((column) => {
      const colName = column.metadata.colName;
      if (columnsMap[colName] == null) {
        columnsMap[colName] = column;
      }
    });

    return new RowToken(columnsMap);
  } else {
    return new RowToken(columns);
  }
}

/**
 * Parse a row from the data that is currently buffered. Throws a
 * `NotEnoughDataError` if the buffer does not contain the full row.
 */
function readRow(parser: Parser): RowToken {
  const colMetadata = parser.colMetadata;
  const columns: Column[] = new Array(colMetadata.length);

  for (let i = 0; i < colMetadata.length; i++) {
    const metadata = colMetadata[i];

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

  return buildRowToken(parser, columns);
}

/**
 * Parse a row, waiting for more data to arrive as necessary. Unlike
 * `readRow`, this can incrementally consume rows that are larger than the
 * parser's current buffer.
 */
async function readRowAsync(parser: Parser): Promise<RowToken> {
  const columns: Column[] = [];

  for (const metadata of parser.colMetadata) {
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
            await parser.waitForChunk(err.byteCount);
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

  return buildRowToken(parser, columns);
}

function rowParser(parser: Parser): RowToken | Promise<RowToken> {
  const startPosition = parser.position;

  try {
    return readRow(parser);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      // The full row was not yet buffered. Fall back to the incremental
      // parser, restarting at the beginning of the row.
      parser.position = startPosition;
      return readRowAsync(parser);
    }

    throw err;
  }
}

export default rowParser;
module.exports = rowParser;
