// s2.2.7.16

import Parser, { type ParserOptions, type TokenReader } from './stream-parser';

import { ReturnValueToken } from './token';

import { readMetadata, type Metadata } from '../metadata-parser';
import { isPLPStream, PLPReader, readValue } from '../value-parser';
import { readBVarChar, readUInt16LE, readUInt8, Result } from './helpers';

interface ReturnValueHeader {
  paramOrdinal: number;
  paramName: string;
  metadata: Metadata;
}

function readHeader(buf: Buffer, offset: number, options: ParserOptions): Result<ReturnValueHeader> {
  let paramOrdinal;
  ({ offset, value: paramOrdinal } = readUInt16LE(buf, offset));

  let paramName;
  ({ offset, value: paramName } = readBVarChar(buf, offset));

  if (paramName.charAt(0) === '@') {
    paramName = paramName.slice(1);
  }

  // status
  ({ offset } = readUInt8(buf, offset));

  let metadata;
  ({ offset, value: metadata } = readMetadata(buf, offset, options));

  return new Result({ paramOrdinal, paramName, metadata }, offset);
}

/**
 * Reads a `RETURNVALUE` token. The returned value can be an arbitrarily large
 * PLP value, so the progress is kept across chunks.
 */
export class ReturnValueTokenReader implements TokenReader {
  declare header: ReturnValueHeader | undefined;

  // The reader of a PLP value that is not complete yet.
  declare plpReader: PLPReader | undefined;

  constructor() {
    this.header = undefined;
    this.plpReader = undefined;
  }

  read(parser: Parser): ReturnValueToken {
    if (this.header === undefined) {
      const { value, offset } = readHeader(parser.buffer, parser.position, parser.options);
      parser.position = offset;
      this.header = value;
    }

    const { paramOrdinal, paramName, metadata } = this.header;

    let value;
    if (isPLPStream(metadata)) {
      this.plpReader ??= new PLPReader(metadata);
      value = this.plpReader.read(parser);
    } else {
      const result = readValue(parser.buffer, parser.position, metadata, parser.options);
      parser.position = result.offset;
      value = result.value;
    }

    return new ReturnValueToken({ paramOrdinal, paramName, metadata, value });
  }
}
