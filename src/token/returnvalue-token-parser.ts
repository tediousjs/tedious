// s2.2.7.16

import Parser from './stream-parser';

import { ReturnValueToken } from './token';

import { readMetadata } from '../metadata-parser';
import { isPLPStream, readPLPStream, readValue } from '../value-parser';
import { NotEnoughDataError, readBVarChar, readUInt16LE, readUInt8 } from './helpers';
import * as iconv from 'iconv-lite';

async function returnParser(parser: Parser): Promise<ReturnValueToken> {
  let paramName;
  let paramOrdinal;
  let metadata;

  while (true) {
    const buf = parser.buffer;
    let offset = parser.position;

    try {
      ({ offset, value: paramOrdinal } = readUInt16LE(buf, offset));
      ({ offset, value: paramName } = readBVarChar(buf, offset));
      // status
      ({ offset } = readUInt8(buf, offset));
      ({ offset, value: metadata } = readMetadata(buf, offset, parser.options, true));

      if (paramName.charAt(0) === '@') {
        paramName = paramName.slice(1);
      }
    } catch (err) {
      if (err instanceof NotEnoughDataError) {
        await parser.waitForChunk();
        continue;
      }

      throw err;
    }

    parser.position = offset;
    break;
  }

  let value;
  while (true) {
    const buf = parser.buffer;
    let offset = parser.position;

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
      try {
        ({ value, offset } = readValue(buf, offset, metadata, parser.options));
      } catch (err) {
        if (err instanceof NotEnoughDataError) {
          await parser.waitForChunk();
          continue;
        }

        throw err;
      }

      parser.position = offset;
    }

    break;
  }

  return new ReturnValueToken({
    paramOrdinal: paramOrdinal,
    paramName: paramName,
    metadata: metadata,
    value: value
  });
}

export default returnParser;
module.exports = returnParser;
