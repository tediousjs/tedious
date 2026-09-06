// s2.2.7.17

import Parser from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';
import * as iconv from 'iconv-lite';

import { isPLPStream, readPLPStream, readPLPStreamSync, readValue } from '../value-parser';
import { NotEnoughDataError } from './helpers';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

async function rowParser(parser: Parser): Promise<RowToken> {
  const columns: Column[] = [];

  for (const metadata of parser.colMetadata) {
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

    return new RowToken(columnsMap);
  } else {
    return new RowToken(columns);
  }
}

function plpValue(chunks: null | Buffer[], metadata: ColumnMetadata): unknown {
  if (chunks === null) {
    return null;
  } else if (metadata.type.name === 'NVarChar' || metadata.type.name === 'Xml') {
    return Buffer.concat(chunks).toString('ucs2');
  } else if (metadata.type.name === 'VarChar') {
    return iconv.decode(Buffer.concat(chunks), metadata.collation?.codepage ?? 'utf8');
  } else if (metadata.type.name === 'VarBinary' || metadata.type.name === 'UDT') {
    return Buffer.concat(chunks);
  }
}

/**
 * Synchronous variant of `rowParser` for parsers that have the complete
 * message buffered. Throws `NotEnoughDataError` if the data is truncated.
 */
export function rowParserSync(parser: Parser): RowToken {
  const colMetadata = parser.colMetadata;
  const columns: Column[] = new Array(colMetadata.length);

  for (let i = 0; i < colMetadata.length; i++) {
    const metadata = colMetadata[i];

    if (isPLPStream(metadata)) {
      columns[i] = { value: plpValue(readPLPStreamSync(parser), metadata), metadata };
    } else {
      const result = readValue(parser.buffer, parser.position, metadata, parser.options);
      parser.position = result.offset;
      columns[i] = { value: result.value, metadata };
    }
  }

  if (parser.options.useColumnNames) {
    const columnsMap: { [key: string]: Column } = Object.create(null);

    for (const column of columns) {
      const colName = column.metadata.colName;
      if (columnsMap[colName] == null) {
        columnsMap[colName] = column;
      }
    }

    return new RowToken(columnsMap);
  } else {
    return new RowToken(columns);
  }
}

export default rowParser;
module.exports = rowParser;
module.exports.rowParserSync = rowParserSync;
