// s2.2.7.13 (introduced in TDS 7.3.B)

import valueParse from '../value-parser';

export default function*(parser, columnsMetaData, options) {
  const length = Math.ceil(columnsMetaData.length / 8);
  const bytes = yield parser.readBuffer(length);
  const bitmap = [];

  for (let i = 0, len = bytes.length; i < len; i++) {
    const byte = bytes[i];
    for (let j = 0; j <= 7; j++) {
      bitmap.push(byte & (1 << j) ? true : false);
    }
  }

  const columns = options.useColumnNames ? {} : [];
  for (let i = 0, len = columnsMetaData.length; i < len; i++) {
    const columnMetaData = columnsMetaData[i];

    let value;

    if (bitmap[i]) {
      value = null;
    } else {
      value = yield* valueParse(parser, columnMetaData, options);
    }

    const column = {
      value: value,
      metadata: columnMetaData
    };

    if (options.useColumnNames) {
      if (columns[columnMetaData.colName] == null) {
        columns[columnMetaData.colName] = column;
      }
    } else {
      columns.push(column);
    }
  }
  return {
    name: 'NBCROW',
    event: 'row',
    columns: columns
  };
}
