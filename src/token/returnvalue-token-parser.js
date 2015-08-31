// s2.2.7.16

import metadataParse from '../metadata-parser';
import valueParse from '../value-parser';

export default function*(parser, colMetadata, options) {
  const paramOrdinal = yield parser.readUInt16LE();

  let paramName = yield* parser.readBVarChar();
  if (paramName.charAt(0) === '@') {
    paramName = paramName.slice(1);
  }

  yield parser.readUInt8(); // status
  const metadata = yield* metadataParse(parser, options);
  const value = yield* valueParse(parser, metadata, options);

  return {
    name: 'RETURNVALUE',
    event: 'returnValue',
    paramOrdinal: paramOrdinal,
    paramName: paramName,
    metadata: metadata,
    value: value
  };
}
