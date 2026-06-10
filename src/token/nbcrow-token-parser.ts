// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser from './stream-parser';

import { buildPLPDecoder, buildValueReader, readPLPStream, readPLPStreamSync } from '../value-parser';
import { NotEnoughDataError } from './helpers';
import { buildRow } from './row-format';

/**
 * Parses a complete row from the already buffered data, without ever
 * suspending. Throws a `NotEnoughDataError` if the row is not fully buffered
 * yet - the parser position is only updated after the row was fully parsed.
 */
function parseNbcRowSync(parser: Parser): unknown {
  const colMetadata = parser.colMetadata;
  const length = colMetadata.length;
  const values: unknown[] = [];

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
      values.push(null);
      continue;
    }

    let reader = metadata.reader;
    if (reader === undefined) {
      reader = metadata.reader = buildValueReader(metadata, parser.options);
    }

    if (reader === null) {
      let chunks;
      ({ value: chunks, offset } = readPLPStreamSync(buf, offset));

      let plpDecoder = metadata.plpDecoder;
      if (plpDecoder === undefined) {
        plpDecoder = metadata.plpDecoder = buildPLPDecoder(metadata, parser.options);
      }

      values.push(plpDecoder(chunks));
    } else {
      const result = reader(buf, offset);
      offset = result.offset;

      values.push(result.value);
    }
  }

  parser.position = offset;

  return buildRow(colMetadata, values, parser.options);
}

async function parseNbcRowAsync(parser: Parser): Promise<unknown> {
  const colMetadata = parser.colMetadata;
  const values: unknown[] = [];
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
      values.push(null);
      continue;
    }

    let reader = metadata.reader;
    if (reader === undefined) {
      reader = metadata.reader = buildValueReader(metadata, parser.options);
    }

    while (true) {
      if (reader === null) {
        const chunks = await readPLPStream(parser);

        let plpDecoder = metadata.plpDecoder;
        if (plpDecoder === undefined) {
          plpDecoder = metadata.plpDecoder = buildPLPDecoder(metadata, parser.options);
        }

        values.push(plpDecoder(chunks));
      } else {
        let result;
        try {
          result = reader(parser.buffer, parser.position);
        } catch (err) {
          if (err instanceof NotEnoughDataError) {
            await parser.waitForChunk();
            continue;
          }

          throw err;
        }

        parser.position = result.offset;
        values.push(result.value);
      }

      break;
    }
  }

  return buildRow(colMetadata, values, parser.options);
}

/**
 * Parses the row following a NBCROW token and returns it in the shape
 * determined by the `rowFormat` and `useColumnNames` options.
 */
function nbcRowParser(parser: Parser): unknown | Promise<unknown> {
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
