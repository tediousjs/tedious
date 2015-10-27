// s2.2.7.14

export default function parseToken(parser, colMetadata, options, callback) {
  if (parser.position + 2 <= parser.buffer.length) {
    const length = parser.buffer.readUInt16LE(parser.position, true);

    if (parser.position + 2 + length <= parser.buffer.length) {
      parser.position += 2;

      const orderColumns = [];
      for (let i = 0, len = length / 2; i < len; i++) {
        orderColumns.push(parser.buffer.readUInt16LE(parser.position, true));
        parser.position += 2;
      }

      return callback({
        name: 'ORDER',
        event: 'order',
        orderColumns: orderColumns
      });
    }
  }

  parser.suspend(() => {
    parseToken(parser, colMetadata, options, callback);
  });
}
