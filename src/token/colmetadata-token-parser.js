'use strict';

const metadataParse = require('../metadata-parser');

function readTableName(parser, options, metadata, callback) {
  if (metadata.type.hasTableName) {
    if (options.tdsVersion >= '7_2') {
      parser.readUInt8((numberOfTableNameParts) => {
        const tableName = [];

        let i = 0;
        function next(done) {
          if (numberOfTableNameParts === i) {
            return done();
          }

          parser.readUsVarChar((part) => {
            tableName.push(part);

            i++;

            next(done);
          });
        }

        next(() => {
          callback(tableName);
        });
      });
    } else {
      parser.readUsVarChar(callback);
    }
  } else {
    callback(undefined);
  }
}

function readColumnName(parser, options, index, metadata, callback) {
  parser.readBVarChar((colName) => {
    if (options.columnNameReplacer) {
      callback(options.columnNameReplacer(colName, index, metadata));
    } else if (options.camelCaseColumns) {
      callback(colName.replace(/^[A-Z]/, function(s) {
        return s.toLowerCase();
      }));
    } else {
      callback(colName);
    }
  });
}

function readColumn(parser, options, index, callback) {
  metadataParse(parser, options, (metadata) => {
    readTableName(parser, options, metadata, (tableName) => {
      readColumnName(parser, options, index, metadata, (colName) => {
        callback({
          userType: metadata.userType,
          flags: metadata.flags,
          type: metadata.type,
          colName: colName,
          collation: metadata.collation,
          precision: metadata.precision,
          scale: metadata.scale,
          udtInfo: metadata.udtInfo,
          dataLength: metadata.dataLength,
          tableName: tableName
        });
      });
    });
  });
}

module.exports = function(parser, colMetadata, options, callback) {
  parser.readUInt16LE((columnCount) => {
    const columns = [];

    let i = 0;
    function next(done) {
      if (i === columnCount) {
        return done();
      }

      readColumn(parser, options, i, (column) => {
        columns.push(column);

        i++;
        next(done);
      });
    }

    next(() => {
      callback({
        name: 'COLMETADATA',
        event: 'columnMetadata',
        columns: columns
      });
    });
  });
};
