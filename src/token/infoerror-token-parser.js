function* parseToken(parser, options) {
  yield parser.readUInt16LE(); // length
  const number = yield parser.readUInt32LE();
  const state = yield parser.readUInt8();
  const clazz = yield parser.readUInt8();
  const message = yield* parser.readUsVarChar();
  const serverName = yield* parser.readBVarChar();
  const procName = yield* parser.readBVarChar();

  let lineNumber;
  if (options.tdsVersion < '7_2') {
    lineNumber = yield parser.readUInt16LE();
  } else {
    lineNumber = yield parser.readUInt32LE();
  }

  return {
    number: number,
    state: state,
    "class": clazz,
    message: message,
    serverName: serverName,
    procName: procName,
    lineNumber: lineNumber
  };
}

export function* infoParser(parser, colMetadata, options) {
  const token = yield* parseToken(parser, options);
  token.name = 'INFO';
  token.event = 'infoMessage';
  return token;
}

export function* errorParser(parser, colMetadata, options) {
  const token = yield* parseToken(parser, options);
  token.name = 'ERROR';
  token.event = 'errorMessage';
  return token;
}
