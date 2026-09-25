// s2.2.7.16

import Parser, { type ParserOptions, type TokenReader } from './stream-parser';

import { ReturnValueStartToken, ReturnValueToken, type Token, ValueChunkToken, ValueEndToken } from './token';

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

/**
 * Reads a `RETURNVALUE` token, streaming a PLP value piece by piece instead of
 * reading it as a whole.
 *
 * A return value without a (non-`null`) PLP value is returned as a single
 * `RETURNVALUE` token. Otherwise, it is returned as a `ReturnValueStartToken`,
 * followed by `ValueChunkToken`s and a `ValueEndToken`.
 */
export class StreamedReturnValueReader implements TokenReader {
  declare hasMore: boolean;

  declare header: ReturnValueHeader | undefined;
  declare plpReader: PLPReader | undefined;
  declare started: boolean;

  constructor() {
    this.hasMore = true;

    this.header = undefined;
    this.plpReader = undefined;
    this.started = false;
  }

  read(parser: Parser): Token {
    if (this.header === undefined) {
      const { value, offset } = readHeader(parser.buffer, parser.position, parser.options);
      parser.position = offset;
      this.header = value;
    }

    const { paramOrdinal, paramName, metadata } = this.header;

    if (!isPLPStream(metadata)) {
      const { value, offset } = readValue(parser.buffer, parser.position, metadata, parser.options);
      parser.position = offset;

      this.hasMore = false;
      return new ReturnValueToken({ paramOrdinal, paramName, metadata, value });
    }

    const plpReader = this.plpReader ??= new PLPReader(metadata);
    plpReader.readLength(parser);

    if (plpReader.isNull) {
      this.hasMore = false;
      return new ReturnValueToken({ paramOrdinal, paramName, metadata, value: null });
    }

    if (!this.started) {
      this.started = true;
      return new ReturnValueStartToken({ paramOrdinal, paramName, metadata, length: plpReader.totalLength });
    }

    const data = plpReader.readChunk(parser);
    if (data !== undefined) {
      return new ValueChunkToken(data);
    }

    this.hasMore = false;
    return new ValueEndToken();
  }
}
