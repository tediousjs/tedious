// s2.2.7.14

export default function*(parser) {
  const columnCount = (yield parser.readUInt16LE("length")) / 2;
  const orderColumns = [];

  for (let i = 0; i < columnCount; i++) {
    orderColumns.push(yield parser.readUInt16LE());
  }

  return {
    name: 'ORDER',
    event: 'order',
    orderColumns: orderColumns
  };
}
