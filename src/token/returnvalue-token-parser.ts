// s2.2.7.16

import Parser from './stream-parser';

import { ReturnValueToken } from './token';

import { readMetadata, type Metadata } from '../metadata-parser';
import { isPLPStream, readPLPStream, readValue, type PLPState } from '../value-parser';
import { readBVarChar, readUInt16LE, readUInt8 } from './helpers';
import { plpValue } from './row-token-parser';

/**
 * The progress of a partially parsed return value token: the header has
 * been read, the value is being read.
 */
export interface ReturnValueState {
  kind: 'returnValue';
  paramOrdinal: number;
  paramName: string;
  metadata: Metadata;
  plp: PLPState | undefined;
}

/**
 * Parses a return value token. Resumable: once the header has been read,
 * it is kept on the parser while the value is read.
 */
function returnParser(parser: Parser): ReturnValueToken {
  let state = parser.tokenState;

  if (state === undefined || state.kind !== 'returnValue') {
    const buf = parser.buffer;

    const { offset: ordinalEnd, value: paramOrdinal } = readUInt16LE(buf, parser.position);
    const { offset: nameEnd, value: name } = readBVarChar(buf, ordinalEnd);
    // status
    const { offset: statusEnd } = readUInt8(buf, nameEnd);
    const { offset, value: metadata } = readMetadata(buf, statusEnd, parser.options);

    const paramName = name.charAt(0) === '@' ? name.slice(1) : name;

    parser.position = offset;
    parser.commit();

    state = parser.tokenState = { kind: 'returnValue', paramOrdinal, paramName, metadata, plp: undefined };
  }

  const metadata = state.metadata;

  let value;
  if (isPLPStream(metadata)) {
    value = plpValue(readPLPStream(parser, state), metadata);
  } else {
    const result = readValue(parser.buffer, parser.position, metadata, parser.options);
    parser.position = result.offset;
    value = result.value;
  }

  parser.tokenState = undefined;

  return new ReturnValueToken({
    paramOrdinal: state.paramOrdinal,
    paramName: state.paramName,
    metadata: metadata,
    value: value
  });
}

export default returnParser;
module.exports = returnParser;
