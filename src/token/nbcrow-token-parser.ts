// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser, { type ParserOptions } from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { NBCRowToken } from './token';

import { decodeChars } from '../charset-decoder';
import { isPLPStream, readPLPStream, readValue } from '../value-parser';
import { NotEnoughDataError } from './helpers';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

// The null bitmap is read straight out of the buffer rather than expanded into
// an array of booleans - it is one bit per column, least significant bit first.
function isNull(buf: Buffer, bitmapOffset: number, index: number) {
  return (buf[bitmapOffset + (index >> 3)] & (1 << (index & 7))) !== 0;
}

function buildToken(columns: Column[], options: ParserOptions): NBCRowToken {
  if (options.useColumnNames) {
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

// Reads the remaining columns of a row, starting at `index`, waiting for more
// data whenever the current buffer runs out. `bitmap` is a copy of the row's
// null bitmap, taken because `parser.buffer` is replaced as data arrives.
async function nbcRowParserAsync(parser: Parser, bitmap: Buffer, columns: Column[], index: number): Promise<NBCRowToken> {
  const colMetadata = parser.colMetadata;

  for (let i = index; i < colMetadata.length; i++) {
    const metadata = colMetadata[i];

    if (isNull(bitmap, 0, i)) {
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

// Same shape as `rowParser`: read the row synchronously while the data is
// there, and only enter an `async` function once a column has to wait.
function nbcRowParser(parser: Parser): NBCRowToken | Promise<NBCRowToken> {
  const colMetadata = parser.colMetadata;
  const length = colMetadata.length;
  const buffer = parser.buffer;
  const options = parser.options;
  const bitmapLength = (length + 7) >> 3;
  const bitmapOffset = parser.position;

  if (buffer.length - bitmapOffset < bitmapLength) {
    return nbcRowParserSlow(parser);
  }

  const columns: Column[] = new Array(length);

  let index = 0;
  let offset = bitmapOffset + bitmapLength;

  try {
    while (index < length) {
      const metadata = colMetadata[index];

      if (isNull(buffer, bitmapOffset, index)) {
        columns[index++] = { value: null, metadata };
        continue;
      }

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
    columns.length = index;
    // `parser.buffer` is replaced when more data arrives, so the bitmap has to
    // be copied out before handing over to the asynchronous path.
    const bitmap = Buffer.from(buffer.subarray(bitmapOffset, bitmapOffset + bitmapLength));
    return nbcRowParserAsync(parser, bitmap, columns, index);
  }

  return buildToken(columns, options);
}

// The null bitmap itself is not fully buffered yet.
async function nbcRowParserSlow(parser: Parser): Promise<NBCRowToken> {
  const bitmapLength = (parser.colMetadata.length + 7) >> 3;

  while (parser.buffer.length - parser.position < bitmapLength) {
    await parser.waitForChunk();
  }

  const bitmap = Buffer.from(parser.buffer.subarray(parser.position, parser.position + bitmapLength));
  parser.position += bitmapLength;

  return await nbcRowParserAsync(parser, bitmap, [], 0);
}

export default nbcRowParser;
module.exports = nbcRowParser;
