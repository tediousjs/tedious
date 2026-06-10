// s2.2.7.17

import Parser from './stream-parser';

import { buildPLPDecoder, buildValueReader, readPLPStream, readPLPStreamSync } from '../value-parser';
import { NotEnoughDataError } from './helpers';
import { buildRow } from './row-format';

/**
 * Parses a complete row from the already buffered data, without ever
 * suspending. Throws a `NotEnoughDataError` if the row is not fully buffered
 * yet - the parser position is only updated after the row was fully parsed.
 */
function parseRowSync(parser: Parser): unknown {
  const colMetadata = parser.colMetadata;
  const length = colMetadata.length;
  const values: unknown[] = [];

  const buf = parser.buffer;
  let offset = parser.position;

  for (let i = 0; i < length; i++) {
    const metadata = colMetadata[i];

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

async function parseRowAsync(parser: Parser): Promise<unknown> {
  const colMetadata = parser.colMetadata;
  const values: unknown[] = [];

  for (const metadata of colMetadata) {
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
 * Parses the row following a ROW token and returns it in the shape
 * determined by the `rowFormat` and `useColumnNames` options.
 */
function rowParser(parser: Parser): unknown | Promise<unknown> {
  try {
    return parseRowSync(parser);
  } catch (err) {
    if (err instanceof NotEnoughDataError) {
      return parseRowAsync(parser);
    }

    throw err;
  }
}

export default rowParser;
module.exports = rowParser;
