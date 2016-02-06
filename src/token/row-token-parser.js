'use strict';

// s2.2.7.17

import valueParse from '../value-parser';

export default function(parser, colMetadata, options, callback) {
  const columns = options.useColumnNames ? {} : [];

  const len = colMetadata.length;
  let i = 0;

  function next(done) {
    if (i === len) {
      return done();
    }


    const columnMetaData = colMetadata[i];
    valueParse(parser, columnMetaData, options, (value) => {
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

      i++;

      next(done);
    });
  }

  next(() => {
    callback({
      name: 'ROW',
      event: 'row',
      columns: columns
    });
  });
}
