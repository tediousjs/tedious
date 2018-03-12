// s2.2.7.17

const valueParse = require('../value-parser');

module.exports = async function(parser, colMetadata, options, callback) {
  const columns = options.useColumnNames ? {} : [];

  const len = colMetadata.length;

  const done = () => {
    callback({
      name: 'ROW',
      event: 'row',
      columns: columns
    });
  };

  for (let i = 0; i < len; i++) {
    const columnMetaData = colMetadata[i];
    const value = await valueParse(parser, columnMetaData, options);

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
    if (i == len - 1) {
      return done();
    }
  }
};
