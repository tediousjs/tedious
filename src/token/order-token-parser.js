// s2.2.7.14

export default function parseToken(parser, colMetadata, options, callback) {
  const buffer = parser.buffer;

  if (parser.position + 2 <= buffer.length) {
    const length = buffer.readUInt16LE(parser.position, true);

    if (parser.position + 2 + length <= buffer.length) {
      parser.position += 2;

      const orderColumns = new Array(length / 2);
      const len = orderColumns.length;

      for (let i = 0; i < len; i++) {
        orderColumns[i] = buffer.readUInt16LE(parser.position, true);
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
