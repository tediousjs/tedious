'use strict';

// s2.2.7.13 (introduced in TDS 7.3.B)

const valueParse = require('../value-parser');

function nullHandler(parser, columnMetaData, options, callback) {
  callback(null);
}

module.exports = function(parser, columnsMetaData, options, callback) {
  const length = Math.ceil(columnsMetaData.length / 8);
  parser.readBuffer(length, (bytes) => {
    const bitmap = [];

    for (let i = 0, len = bytes.length; i < len; i++) {
      const byte = bytes[i];
      for (let j = 0; j <= 7; j++) {
        bitmap.push(byte & (1 << j) ? true : false);
      }
    }

    const columns = options.useColumnNames ? {} : [];

    const len = columnsMetaData.length;
    let i = 0;
    function next(done) {
      if (i === len) {
        return done();
      }

      const columnMetaData = columnsMetaData[i];

      (bitmap[i] ? nullHandler : valueParse)(parser, columnMetaData, options, (value) => {
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
        name: 'NBCROW',
        event: 'row',
        columns: columns
      });
    });
  });
};
