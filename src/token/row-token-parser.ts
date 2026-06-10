// s2.2.7.17

import Parser from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';

import { buildPLPDecoder, buildValueReader, readPLPStream, readPLPStreamSync } from '../value-parser';
import { NotEnoughDataError } from './helpers';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
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
 * Parses a complete row from the already buffered data, without ever
 * suspending. Throws a `NotEnoughDataError` if the row is not fully buffered
 * yet - the parser position is only updated after the row was fully parsed.
 */
function parseRowSync(parser: Parser): RowToken {
  const colMetadata = parser.colMetadata;
  const length = colMetadata.length;
  const columns: Column[] = [];

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

      columns.push({ value: plpDecoder(chunks), metadata });
    } else {
      const result = reader(buf, offset);
      offset = result.offset;

      columns.push({ value: result.value, metadata });
    }
  }

  parser.position = offset;

  return buildRowToken(parser, columns);
}

async function parseRowAsync(parser: Parser): Promise<RowToken> {
  const columns: Column[] = [];

  for (const metadata of parser.colMetadata) {
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

        columns.push({ value: plpDecoder(chunks), metadata });
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
        columns.push({ value: result.value, metadata });
      }

      break;
    }
  }

  return buildRowToken(parser, columns);
}

function rowParser(parser: Parser): RowToken | Promise<RowToken> {
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
