// s2.2.7.17

import Parser from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';

import { decodeChars } from '../charset-decoder';
import { isPLPStream, readPLPStream, readValue } from '../value-parser';
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

export default rowParser;
module.exports = rowParser;
