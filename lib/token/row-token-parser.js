'use strict';

// s2.2.7.17

var valueParse = require('../value-parser');

module.exports = function (parser, colMetadata, options, callback) {
  var columns = options.useColumnNames ? {} : [];

  var len = colMetadata.length;
  var i = 0;

  function next(done) {
    if (i === len) {
      return done();
    }

    var columnMetaData = colMetadata[i];
    valueParse(parser, columnMetaData, options, function (value) {
      var column = {
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

  next(function () {
    callback({
      name: 'ROW',
      event: 'row',
      columns: columns
    });
  });
};