import type { BufferList } from 'bl/BufferList';
import { NotEnoughDataError, readUInt16LE, type Result } from './helpers';
import { type ParserOptions } from './stream-parser';

import { SSPIToken } from './token';

interface Data {
  magic: string;
  type: number;
  domainLen: number;
  domainMax: number;
  domainOffset: number;
  flags: number;
  nonce: Buffer;
  zeroes: Buffer;
  targetLen: number;
  targetMax: number;
  targetOffset: number;
  oddData: Buffer;
  domain: string;
  target: Buffer;
}

function parseChallenge(buffer: Buffer) {
  const challenge: Partial<Data> = {};

  challenge.magic = buffer.slice(0, 8).toString('utf8');
  challenge.type = buffer.readInt32LE(8);
  challenge.domainLen = buffer.readInt16LE(12);
  challenge.domainMax = buffer.readInt16LE(14);
  challenge.domainOffset = buffer.readInt32LE(16);
  challenge.flags = buffer.readInt32LE(20);
  challenge.nonce = buffer.slice(24, 32);
  challenge.zeroes = buffer.slice(32, 40);
  challenge.targetLen = buffer.readInt16LE(40);
  challenge.targetMax = buffer.readInt16LE(42);
  challenge.targetOffset = buffer.readInt32LE(44);
  challenge.oddData = buffer.slice(48, 56);
  challenge.domain = buffer.slice(56, 56 + challenge.domainLen).toString('ucs2');
  challenge.target = buffer.slice(56 + challenge.domainLen, 56 + challenge.domainLen + challenge.targetLen);

  return challenge as Data;
}

function sspiParser(buf: Buffer | BufferList, offset: number, _options: ParserOptions): Result<SSPIToken> {
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  const data = buf.slice(offset, offset + tokenLength);
  offset += tokenLength;

  return { value: new SSPIToken(parseChallenge(data), data), offset };
}

export default sspiParser;
module.exports = sspiParser;
