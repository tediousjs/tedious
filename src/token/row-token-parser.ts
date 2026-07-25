// s2.2.7.17

import Parser, { type ParserOptions } from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';

import { decodeChars } from '../charset-decoder';
import { isPLPStream, readPLPStream, readValue } from '../value-parser';
import { NotEnoughDataError } from './helpers';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

function buildToken(columns: Column[], options: ParserOptions): RowToken {
  if (options.useColumnNames) {
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

// Reads the remaining columns of a row, starting at `index`, waiting for more
// data whenever the current buffer runs out.
async function rowParserAsync(parser: Parser, columns: Column[], index: number): Promise<RowToken> {
  const colMetadata = parser.colMetadata;

  for (let i = index; i < colMetadata.length; i++) {
    const metadata = colMetadata[i];

    while (true) {
      if (isPLPStream(metadata)) {
        const chunks = await readPLPStream(parser);

        if (chunks === null) {
          columns.push({ value: chunks, metadata });
        } else if (metadata.type.name === 'NVarChar' || metadata.type.name === 'Xml') {
          columns.push({ value: Buffer.concat(chunks).toString('ucs2'), metadata });
        } else if (metadata.type.name === 'VarChar') {
          const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
          columns.push({ value: decodeChars(buffer, 0, buffer.length, metadata.collation?.codepage ?? 'utf8'), metadata });
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

  return buildToken(columns, parser.options);
}

// Rows are by far the most frequent token in a result set, so the common case -
// the whole row being available in the buffer already, and none of its columns
// needing a PLP stream - is handled without entering an `async` function at
// all. That saves a promise and a microtask per row. As soon as a column needs
// to wait for more data, parsing continues asynchronously from that column on.
function rowParser(parser: Parser): RowToken | Promise<RowToken> {
  const colMetadata = parser.colMetadata;
  const length = colMetadata.length;
  const buffer = parser.buffer;
  const options = parser.options;

  // Sized up front - growing an array by pushing costs noticeably more than
  // filling one that is already the right size, even accounting for the holey
  // elements kind that `new Array()` produces.
  const columns: Column[] = new Array(length);

  let index = 0;
  let offset = parser.position;

  // One `try` around the whole row rather than one per column. `offset` and
  // `index` only advance after a column was read in full, so a column running
  // out of data leaves both pointing at the column to resume from.
  try {
    while (index < length) {
      const metadata = colMetadata[index];

      if (isPLPStream(metadata)) {
        break;
      }

      const result = readValue(buffer, offset, metadata, options);

      offset = result.offset;
      columns[index++] = { value: result.value, metadata };
    }
  } catch (err) {
    if (!(err instanceof NotEnoughDataError)) {
      throw err;
    }
  }

  parser.position = offset;

  if (index < length) {
    // Trim the unfilled tail so the asynchronous path can keep pushing.
    columns.length = index;
    return rowParserAsync(parser, columns, index);
  }

  return buildToken(columns, options);
}

export default rowParser;
module.exports = rowParser;
