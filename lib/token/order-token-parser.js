'use strict';

// s2.2.7.14

module.exports = function (parser, colMetadata, options, callback) {
  parser.readUInt16LE(function (length) {
    var columnCount = length / 2;
    var orderColumns = [];

    var i = 0;
    function next(done) {
      if (i === columnCount) {
        return done();
      }

      parser.readUInt16LE(function (column) {
        orderColumns.push(column);

        i++;

        next(done);
      });
    }

    next(function () {
      callback({
        name: 'ORDER',
        event: 'order',
        orderColumns: orderColumns
      });
    });
  });
};