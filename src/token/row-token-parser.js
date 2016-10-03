'use strict';

// s2.2.7.17

const valueParse = require('../value-parser');

module.exports = function parseToken(parser, colMetadata, options, callback) {
  this.pushState({ columns: [] });

  return readColumnValue;
};

function readColumnValue() {
  const state = this.currentState();

  if (state.columns.length === this.colMetadata.length) {
    return finishParseToken;
  }

  const columnMetaData = this.colMetadata[state.columns.length];
  this.pushState({ metadata: columnMetaData });

  return valueParse(this, columnMetaData, afterReadColumnValue);
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
    name: 'ROW',
    event: 'row',
    columns: state.columns
  });

  return this.parseNextToken;
}
