// s2.2.7.17

import Parser, { type ParserOptions } from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';
import * as iconv from 'iconv-lite';

import { isPLPStream, readPLPStream, readValue } from '../value-parser';
import { NotEnoughDataError } from './helpers';
import { decryptWithKey, decryptSymmetricKey } from '../always-encrypted/key-crypto';
import { type CryptoMetadata } from '../always-encrypted/types';

interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

/**
 * Decrypts an encrypted column value and parses it to the original data type.
 *
 * @param value - The encrypted value (Buffer) from the column
 * @param cryptoMetadata - The crypto metadata containing encryption info
 * @param options - Parser options containing decryption settings
 * @returns The decrypted and parsed value
 */
async function decryptColumnValue(
  value: Buffer,
  cryptoMetadata: CryptoMetadata,
  options: ParserOptions
): Promise<unknown> {
  // Initialize the cipher algorithm if not already done
  if (!cryptoMetadata.cipherAlgorithm) {
    await decryptSymmetricKey(cryptoMetadata, options);
  }

  // Decrypt the cipher text
  const decryptedValue = decryptWithKey(value, cryptoMetadata, options);

  // Parse the decrypted bytes using the base type info
  if (!cryptoMetadata.baseTypeInfo) {
    throw new Error('baseTypeInfo is required for decryption');
  }

  const result = readValue(decryptedValue, 0, cryptoMetadata.baseTypeInfo, options);
  return result.value;
}

async function rowParser(parser: Parser): Promise<RowToken> {
  const columns: Column[] = [];

  for (const metadata of parser.colMetadata) {
    while (true) {
      let value: unknown;

      if (isPLPStream(metadata)) {
        const chunks = await readPLPStream(parser);

        if (chunks === null) {
          value = chunks;
        } else if (metadata.type.name === 'NVarChar' || metadata.type.name === 'Xml') {
          value = Buffer.concat(chunks).toString('ucs2');
        } else if (metadata.type.name === 'VarChar') {
          value = iconv.decode(Buffer.concat(chunks), metadata.collation?.codepage ?? 'utf8');
        } else if (metadata.type.name === 'VarBinary' || metadata.type.name === 'UDT') {
          value = Buffer.concat(chunks);
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
        value = result.value;
      }

      // Decrypt the value if the column is encrypted
      if (metadata.cryptoMetadata && value !== null && Buffer.isBuffer(value)) {
        value = await decryptColumnValue(value, metadata.cryptoMetadata, parser.options);
      }

      columns.push({ value, metadata });

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
