// s2.2.7.17

import valueParse from '../value-parser';

export default function*(parser, columnsMetaData, options) {
  const columns = options.useColumnNames ? {} : [];

  for (let i = 0, len = columnsMetaData.length; i < len; i++) {
    const columnMetaData = columnsMetaData[i];
    const value = yield* valueParse(parser, columnMetaData, options);
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
    name: 'ROW',
    event: 'row',
    columns: columns
  };
}
