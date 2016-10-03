'use strict';

const metadataParse = require('../metadata-parser');

function readColumn() {
  const state = this.currentState();

  if (state.columns.length === state.columnCount) {
    return finishParseToken;
  }

  this.pushState({
    index: state.columns.length,
    userType: undefined,
    flags: undefined,
    type: undefined,
    colName: undefined,
    collation: undefined,
    precision: undefined,
    scale: undefined,
    udtInfo: undefined,
    dataLength: undefined,
    tableName: undefined
  });

  return metadataParse.call(this, this, afterMetadata);
}

function afterMetadata() {
  const metadata = this.popState();
  const column = this.currentState();

  column.userType = metadata.userType;
  column.flags = metadata.flags;
  column.type = metadata.type;
  column.collation = metadata.collation;
  column.precision = metadata.precision;
  column.scale = metadata.scale;
  column.udtInfo = metadata.udtInfo;
  column.dataLength = metadata.dataLength;

  return readTableName;
}

function readTableName() {
  const column = this.currentState();

  // if (column.type.hasTableName) {
  //   if (options.tdsVersion >= '7_2') {
  //     parser.readUInt8((numberOfTableNameParts) => {
  //       const tableName = [];
  //
  //       let i = 0;
  //       function next(done) {
  //         if (numberOfTableNameParts === i) {
  //           return done();
  //         }
  //
  //         parser.readUsVarChar((part) => {
  //           tableName.push(part);
  //
  //           i++;
  //
  //           next(done);
  //         });
  //       }
  //
  //       next(() => {
  //         callback(tableName);
  //       });
  //     });
  //   } else {
  //     parser.readUsVarChar(callback);
  //   }
  // } else {
  //   callback(undefined);
  //   return readColumnName;
  // }

  return readColumnName;
}

function readColumnName() {
  if (!this.bytesAvailable(1)) {
    return;
  }

  const length = this.readUInt8() * 2;
  if (!this.bytesAvailable(1 + length)) {
    return;
  }

  const column = this.currentState();
  const colName = this.readString('ucs2', 1, length);

  this.consumeBytes(1 + length);

  if (this.options.columnNameReplacer) {
    // TODO: Pass a fake metadata object here
    column.colName = this.options.columnNameReplacer(colName, column.index, column);
  } else if (this.options.camelCaseColumns) {
    column.colName = colName.replace(/^[A-Z]/, function(s) {
      return s.toLowerCase();
    });
  } else {
    column.colName = colName;
  }

  return finishReadColumn;
}

function finishReadColumn() {
  const column = this.popState();
  this.currentState().columns.push(column);

  return readColumn;
}

function finishParseToken() {
  const state = this.popState();

  this.push({
    name: 'COLMETADATA',
    event: 'columnMetadata',
    columns: state.columns
  });

  this.colMetadata = state.columns;

  return this.parseNextToken;
}

module.exports = function() {
  if (!this.bytesAvailable(2)) {
    return;
  }

  this.pushState({
    columns: [],
    columnCount: this.readUInt16LE(),
  });

  this.consumeBytes(2);

  return readColumn;
};
