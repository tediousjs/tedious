// s2.2.7.13 (introduced in TDS 7.3.B)

import Parser, { type ParserOptions } from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';
import { type BaseMetadata } from '../metadata-parser';

import { NBCRowToken } from './token';
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
 * Parses a decrypted value (raw bytes) into the appropriate JavaScript type.
 * Unlike readValue(), this function handles raw decrypted data that does NOT
 * have TDS length prefixes.
 *
 * @param buffer - The decrypted raw bytes
 * @param metadata - The base type metadata for the decrypted value
 * @param options - Parser options
 * @returns The parsed JavaScript value
 */
function parseDecryptedValue(buffer: Buffer, metadata: BaseMetadata, options: ParserOptions): unknown {
  const type = metadata.type;

  // Note: Empty buffer handling is type-specific.
  // For strings and binary, empty buffer means empty value (not null).
  // For fixed-size types, empty buffer would be an error handled in their cases.

  switch (type.name) {
    case 'Null':
      return null;

    case 'TinyInt':
      if (buffer.length !== 1) {
        throw new Error(`Invalid decrypted TinyInt: expected 1 byte, got ${buffer.length}`);
      }
      return buffer.readUInt8(0);

    case 'SmallInt':
      if (buffer.length !== 2) {
        throw new Error(`Invalid decrypted SmallInt: expected 2 bytes, got ${buffer.length}`);
      }
      return buffer.readInt16LE(0);

    case 'Int':
      if (buffer.length !== 4) {
        throw new Error(`Invalid decrypted Int: expected 4 bytes, got ${buffer.length}`);
      }
      return buffer.readInt32LE(0);

    case 'BigInt':
      if (buffer.length !== 8) {
        throw new Error(`Invalid decrypted BigInt: expected 8 bytes, got ${buffer.length}`);
      }
      return buffer.readBigInt64LE(0).toString();

    // IntN is a nullable integer that can be 1, 2, 4, or 8 bytes
    case 'IntN':
      switch (buffer.length) {
        case 1:
          return buffer.readUInt8(0);
        case 2:
          return buffer.readInt16LE(0);
        case 4:
          return buffer.readInt32LE(0);
        case 8:
          return buffer.readBigInt64LE(0).toString();
        default:
          throw new Error(`Invalid decrypted IntN: unexpected length ${buffer.length}`);
      }

    case 'Real':
      if (buffer.length !== 4) {
        throw new Error(`Invalid decrypted Real: expected 4 bytes, got ${buffer.length}`);
      }
      return buffer.readFloatLE(0);

    case 'Float':
      if (buffer.length !== 8) {
        throw new Error(`Invalid decrypted Float: expected 8 bytes, got ${buffer.length}`);
      }
      return buffer.readDoubleLE(0);

    // FloatN is a nullable float that can be 4 or 8 bytes
    case 'FloatN':
      switch (buffer.length) {
        case 4:
          return buffer.readFloatLE(0);
        case 8:
          return buffer.readDoubleLE(0);
        default:
          throw new Error(`Invalid decrypted FloatN: unexpected length ${buffer.length}`);
      }

    case 'SmallMoney': {
      if (buffer.length !== 4) {
        throw new Error(`Invalid decrypted SmallMoney: expected 4 bytes, got ${buffer.length}`);
      }
      const value = buffer.readInt32LE(0);
      return value / 10000;
    }

    case 'Money': {
      if (buffer.length !== 8) {
        throw new Error(`Invalid decrypted Money: expected 8 bytes, got ${buffer.length}`);
      }
      // Money is stored as: high (bytes 0-3), low (bytes 4-7)
      const high = buffer.readInt32LE(0);
      const low = buffer.readUInt32LE(4);
      return (low + (0x100000000 * high)) / 10000;
    }

    // MoneyN is a nullable money that can be 4 or 8 bytes
    case 'MoneyN': {
      switch (buffer.length) {
        case 4: {
          // SmallMoney format
          const value = buffer.readInt32LE(0);
          return value / 10000;
        }
        case 8: {
          // Money format: high (bytes 0-3), low (bytes 4-7)
          const high = buffer.readInt32LE(0);
          const low = buffer.readUInt32LE(4);
          return (low + (0x100000000 * high)) / 10000;
        }
        default:
          throw new Error(`Invalid decrypted MoneyN: unexpected length ${buffer.length}`);
      }
    }

    case 'Bit':
      if (buffer.length !== 1) {
        throw new Error(`Invalid decrypted Bit: expected 1 byte, got ${buffer.length}`);
      }
      return buffer.readUInt8(0) === 1;

    // BitN is a nullable bit (1 byte)
    case 'BitN':
      if (buffer.length !== 1) {
        throw new Error(`Invalid decrypted BitN: expected 1 byte, got ${buffer.length}`);
      }
      return buffer.readUInt8(0) === 1;

    case 'SmallDateTime': {
      if (buffer.length !== 4) {
        throw new Error(`Invalid decrypted SmallDateTime: expected 4 bytes, got ${buffer.length}`);
      }
      const days = buffer.readUInt16LE(0);
      const minutes = buffer.readUInt16LE(2);
      const date = new Date(Date.UTC(1900, 0, 1));
      date.setUTCDate(date.getUTCDate() + days);
      date.setUTCMinutes(date.getUTCMinutes() + minutes);
      return options.useUTC === false ? new Date(date.getTime() + date.getTimezoneOffset() * 60000) : date;
    }

    case 'DateTime': {
      if (buffer.length !== 8) {
        throw new Error(`Invalid decrypted DateTime: expected 8 bytes, got ${buffer.length}`);
      }
      const days = buffer.readInt32LE(0);
      const threeHundredthsOfSecond = buffer.readUInt32LE(4);
      const date = new Date(Date.UTC(1900, 0, 1));
      date.setUTCDate(date.getUTCDate() + days);
      date.setUTCMilliseconds(date.getUTCMilliseconds() + threeHundredthsOfSecond * 10 / 3);
      return options.useUTC === false ? new Date(date.getTime() + date.getTimezoneOffset() * 60000) : date;
    }

    // DateTimeN is a nullable datetime that can be 4 (SmallDateTime) or 8 (DateTime) bytes
    case 'DateTimeN': {
      switch (buffer.length) {
        case 4: {
          // SmallDateTime format
          const days = buffer.readUInt16LE(0);
          const minutes = buffer.readUInt16LE(2);
          const date = new Date(Date.UTC(1900, 0, 1));
          date.setUTCDate(date.getUTCDate() + days);
          date.setUTCMinutes(date.getUTCMinutes() + minutes);
          return options.useUTC === false ? new Date(date.getTime() + date.getTimezoneOffset() * 60000) : date;
        }
        case 8: {
          // DateTime format
          const days = buffer.readInt32LE(0);
          const threeHundredthsOfSecond = buffer.readUInt32LE(4);
          const date = new Date(Date.UTC(1900, 0, 1));
          date.setUTCDate(date.getUTCDate() + days);
          date.setUTCMilliseconds(date.getUTCMilliseconds() + threeHundredthsOfSecond * 10 / 3);
          return options.useUTC === false ? new Date(date.getTime() + date.getTimezoneOffset() * 60000) : date;
        }
        default:
          throw new Error(`Invalid decrypted DateTimeN: unexpected length ${buffer.length}`);
      }
    }

    case 'Date': {
      if (buffer.length !== 3) {
        throw new Error(`Invalid decrypted Date: expected 3 bytes, got ${buffer.length}`);
      }
      const days = buffer.readUIntLE(0, 3);
      const date = new Date(Date.UTC(1, 0, 1));
      date.setUTCFullYear(1);
      date.setUTCDate(date.getUTCDate() + days);
      return options.useUTC === false ? new Date(date.getTime() + date.getTimezoneOffset() * 60000) : date;
    }

    case 'UniqueIdentifier':
    case 'UniqueIdentifierN': {
      if (buffer.length !== 16) {
        throw new Error(`Invalid decrypted UniqueIdentifier: expected 16 bytes, got ${buffer.length}`);
      }
      if (options.lowerCaseGuids) {
        return [
          buffer.toString('hex', 3, 4) + buffer.toString('hex', 2, 3) +
          buffer.toString('hex', 1, 2) + buffer.toString('hex', 0, 1),
          buffer.toString('hex', 5, 6) + buffer.toString('hex', 4, 5),
          buffer.toString('hex', 7, 8) + buffer.toString('hex', 6, 7),
          buffer.toString('hex', 8, 10),
          buffer.toString('hex', 10, 16)
        ].join('-');
      } else {
        return [
          buffer.toString('hex', 3, 4).toUpperCase() + buffer.toString('hex', 2, 3).toUpperCase() +
          buffer.toString('hex', 1, 2).toUpperCase() + buffer.toString('hex', 0, 1).toUpperCase(),
          buffer.toString('hex', 5, 6).toUpperCase() + buffer.toString('hex', 4, 5).toUpperCase(),
          buffer.toString('hex', 7, 8).toUpperCase() + buffer.toString('hex', 6, 7).toUpperCase(),
          buffer.toString('hex', 8, 10).toUpperCase(),
          buffer.toString('hex', 10, 16).toUpperCase()
        ].join('-');
      }
    }

    case 'VarChar':
    case 'Char':
    case 'Text': {
      // Validate max length
      if (metadata.dataLength !== undefined && buffer.length > metadata.dataLength) {
        throw new Error(`Decrypted VarChar size (${buffer.length}) exceeds max (${metadata.dataLength})`);
      }
      // Raw bytes, decode with collation's codepage
      return iconv.decode(buffer, metadata.collation?.codepage ?? 'utf8');
    }

    case 'NVarChar':
    case 'NChar':
    case 'NText':
    case 'Xml': {
      // Validate max length
      if (metadata.dataLength !== undefined && buffer.length > metadata.dataLength) {
        throw new Error(`Decrypted NVarChar size (${buffer.length}) exceeds max (${metadata.dataLength})`);
      }
      // Validate even number of bytes for UCS-2
      if (buffer.length % 2 !== 0) {
        throw new Error(`Invalid decrypted NVarChar: odd byte count (${buffer.length})`);
      }
      // Raw UCS-2/UTF-16LE bytes
      return buffer.toString('ucs2');
    }

    case 'VarBinary':
    case 'Binary':
    case 'Image': {
      // Validate max length
      if (metadata.dataLength !== undefined && buffer.length > metadata.dataLength) {
        throw new Error(`Decrypted VarBinary size (${buffer.length}) exceeds max (${metadata.dataLength})`);
      }
      return buffer;
    }

    case 'Numeric':
    case 'Decimal':
    case 'NumericN':
    case 'DecimalN': {
      // Validate minimum size (1 byte sign + at least some value bytes)
      if (buffer.length < 1) {
        throw new Error(`Invalid decrypted Numeric: buffer too small (${buffer.length})`);
      }
      // First byte is sign (1=positive, 0=negative) - same as TDS protocol
      const signByte = buffer.readUInt8(0);
      if (signByte !== 0 && signByte !== 1) {
        throw new Error(`Invalid decrypted Numeric: invalid sign byte (${signByte})`);
      }
      const sign = signByte === 1 ? 1 : -1;
      // Remaining bytes are the value in little-endian
      let value = 0n;
      for (let i = buffer.length - 1; i >= 1; i--) {
        value = value * 256n + BigInt(buffer.readUInt8(i));
      }
      const scale = metadata.scale ?? 0;
      if (scale === 0) {
        return sign * Number(value);
      }
      const divisor = 10n ** BigInt(scale);
      const intPart = value / divisor;
      const fracPart = value % divisor;
      const fracStr = fracPart.toString().padStart(scale, '0');
      return sign * Number(`${intPart}.${fracStr}`);
    }

    case 'Time': {
      // Time is stored as a scaled integer representing time since midnight
      // Scale 0-2: 3 bytes, scale 3-4: 4 bytes, scale 5-7: 5 bytes
      const scale = metadata.scale ?? 7;
      let timeValue: number;
      switch (buffer.length) {
        case 3:
          timeValue = buffer.readUIntLE(0, 3);
          break;
        case 4:
          timeValue = buffer.readUInt32LE(0);
          break;
        case 5:
          timeValue = buffer.readUIntLE(0, 5);
          break;
        default:
          throw new Error(`Invalid decrypted Time: unexpected length ${buffer.length}`);
      }

      // Scale up to scale 7 (100 nanosecond units)
      if (scale < 7) {
        for (let i = scale; i < 7; i++) {
          timeValue *= 10;
        }
      }

      // Convert to milliseconds (100ns units / 10000 = ms)
      const ms = Math.floor(timeValue / 10000);
      const date = new Date(0);
      if (options.useUTC === false) {
        date.setHours(Math.floor(ms / 3600000));
        date.setMinutes(Math.floor((ms % 3600000) / 60000));
        date.setSeconds(Math.floor((ms % 60000) / 1000));
        date.setMilliseconds(ms % 1000);
      } else {
        date.setUTCHours(Math.floor(ms / 3600000));
        date.setUTCMinutes(Math.floor((ms % 3600000) / 60000));
        date.setUTCSeconds(Math.floor((ms % 60000) / 1000));
        date.setUTCMilliseconds(ms % 1000);
      }
      return date;
    }

    case 'DateTime2': {
      // DateTime2 is time (3-5 bytes) + date (3 bytes)
      const scale = metadata.scale ?? 7;
      let timeLength: number;
      if (scale <= 2) {
        timeLength = 3;
      } else if (scale <= 4) {
        timeLength = 4;
      } else {
        timeLength = 5;
      }

      if (buffer.length !== timeLength + 3) {
        throw new Error(`Invalid decrypted DateTime2: expected ${timeLength + 3} bytes, got ${buffer.length}`);
      }

      // Read time portion
      let timeValue: number;
      switch (timeLength) {
        case 3:
          timeValue = buffer.readUIntLE(0, 3);
          break;
        case 4:
          timeValue = buffer.readUInt32LE(0);
          break;
        case 5:
          timeValue = buffer.readUIntLE(0, 5);
          break;
        default:
          throw new Error('unreachable');
      }

      // Scale up to scale 7
      if (scale < 7) {
        for (let i = scale; i < 7; i++) {
          timeValue *= 10;
        }
      }

      // Read date portion (3 bytes, days since 0001-01-01)
      const days = buffer.readUIntLE(timeLength, 3);

      // Convert time to milliseconds
      const ms = Math.floor(timeValue / 10000);

      // Create date: days since 0001-01-01 + time
      const date = new Date(Date.UTC(2000, 0, days - 730118));
      date.setUTCMilliseconds(ms);
      return options.useUTC === false ? new Date(date.getTime() + date.getTimezoneOffset() * 60000) : date;
    }

    case 'DateTimeOffset': {
      // DateTimeOffset is time (3-5 bytes) + date (3 bytes) + offset (2 bytes)
      const scale = metadata.scale ?? 7;
      let timeLength: number;
      if (scale <= 2) {
        timeLength = 3;
      } else if (scale <= 4) {
        timeLength = 4;
      } else {
        timeLength = 5;
      }

      if (buffer.length !== timeLength + 5) {
        throw new Error(`Invalid decrypted DateTimeOffset: expected ${timeLength + 5} bytes, got ${buffer.length}`);
      }

      // Read time portion
      let timeValue: number;
      switch (timeLength) {
        case 3:
          timeValue = buffer.readUIntLE(0, 3);
          break;
        case 4:
          timeValue = buffer.readUInt32LE(0);
          break;
        case 5:
          timeValue = buffer.readUIntLE(0, 5);
          break;
        default:
          throw new Error('unreachable');
      }

      // Scale up to scale 7
      if (scale < 7) {
        for (let i = scale; i < 7; i++) {
          timeValue *= 10;
        }
      }

      // Read date portion (3 bytes)
      const days = buffer.readUIntLE(timeLength, 3);

      // Read offset (2 bytes) - offset in minutes
      // const offsetMinutes = buffer.readInt16LE(timeLength + 3);

      // Convert time to milliseconds
      const ms = Math.floor(timeValue / 10000);

      // Create date in UTC
      const date = new Date(Date.UTC(2000, 0, days - 730118));
      date.setUTCMilliseconds(ms);
      return date;
    }

    default:
      throw new Error(`Unsupported decrypted type: ${type.name}`);
  }
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
  const decryptedValue = decryptWithKey(value, cryptoMetadata.cipherAlgorithm!);

  // Parse the decrypted bytes using the base type info
  // Note: Decrypted values are raw bytes WITHOUT TDS length prefixes
  if (!cryptoMetadata.baseTypeInfo) {
    throw new Error('baseTypeInfo is required for decryption');
  }

  return parseDecryptedValue(decryptedValue, cryptoMetadata.baseTypeInfo, options);
}

async function nbcRowParser(parser: Parser): Promise<NBCRowToken> {
  const colMetadata = parser.colMetadata;
  const columns: Column[] = [];
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
      columns.push({ value: null, metadata });
      continue;
    }

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

    return new NBCRowToken(columnsMap);
  } else {
    return new NBCRowToken(columns);
  }
}


export default nbcRowParser;
module.exports = nbcRowParser;
