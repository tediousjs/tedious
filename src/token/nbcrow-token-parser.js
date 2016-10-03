'use strict';

// s2.2.7.13 (introduced in TDS 7.3.B)

const valueParse = require('../value-parser');

function nullHandler(parser, columnMetaData, options, callback) {
  callback(null);
}

module.exports = function(parser, columnsMetaData, options, callback) {
  const length = Math.ceil(columnsMetaData.length / 8);

  if (!this.bytesAvailable(length)) {
    return;
  }

  const bytes = this.readBuffer(0, length);
  const bitmap = [];

  for (let i = 0, len = bytes.length; i < len; i++) {
    const byte = bytes[i];
    for (let j = 0; j <= 7; j++) {
      bitmap.push(byte & (1 << j) ? true : false);
    }
  }

  this.parser.push({ columns: [], bitmap: bitmap });
  return readColumnValue;
};

function readColumnValue() {
  const state = this.currentState();

  if (state.columns.length === this.colMetadata.length) {
    return finishParseToken;
  }

  const columnMetaData = this.colMetadata[state.columns.length];
  this.pushState({ metadata: columnMetaData });

  if (state.bitmap[i]) {
    this.pushState({ value: null });
    return afterReadColumnValue;
  } else {
    return valueParse(this, columnMetaData, afterReadColumnValue)
  }
}

function afterReadColumnValue() {
  const column = {
    value: this.popState().value,
    metadata: this.popState().metadata
  };

  this.currentState().columns.push(column);

  return readColumnValue;
}

function finishParseToken() {
  const state = this.popState();

  // TODO: Handle options.useColumnNames

  this.push({
    name: 'NBCROW',
    event: 'row',
    columns: state.columns
  });

  return this.parseNextToken;
}
