function readUsVarChar(parser) {
  const length = parser.buffer.readUInt16LE(parser.position, true);
  return parser.buffer.toString("ucs2", parser.position += 2, parser.position += length * 2);
}

function readBVarChar(parser) {
  const length = parser.buffer.readUInt8(parser.position, true);
  return parser.buffer.toString("ucs2", parser.position += 1, parser.position += length * 2);
}

function parseToken(parser, options, name, event, callback) {
  if (parser.position + 2 <= parser.buffer.length) {
    const length = parser.buffer.readUInt16LE(parser.position, true);

    if (parser.position + 2 + length <= parser.buffer.length) {
      parser.position += 2;

      const number = parser.buffer.readUInt32LE(parser.position, true);
      parser.position += 4;

      const state = parser.buffer.readUInt8(parser.position, true);
      parser.position += 1;

      const clazz = parser.buffer.readUInt8(parser.position, true);
      parser.position += 1;

      const message = readUsVarChar(parser);
      const serverName = readBVarChar(parser);
      const procName = readBVarChar(parser);

      let lineNumber;
      if (options.tdsVersion < '7_2') {
        lineNumber = parser.buffer.readUInt16LE(parser.position, true);
        parser.position += 2;
      } else {
        lineNumber = parser.buffer.readUInt32LE(parser.position, true);
        parser.position += 4;
      }

      return callback({
        name: name,
        event: event,
        number: number,
        state: state,
        "class": clazz,
        message: message,
        serverName: serverName,
        procName: procName,
        lineNumber: lineNumber
      });
    }
  }

  parser.suspend(() => {
    parseToken(parser, options, name, event, callback);
  });
}

export function infoParser(parser, colMetadata, options, callback) {
  parseToken(parser, options, 'INFO', 'infoMessage', callback);
}

export function errorParser(parser, colMetadata, options, callback) {
  parseToken(parser, options, 'ERROR', 'errorMessage', callback);
}
