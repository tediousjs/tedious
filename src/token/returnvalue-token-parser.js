'use strict';

// s2.2.7.16

const metadataParse = require('../metadata-parser');
const valueParse = require('../value-parser');

module.exports = function(parser, colMetadata, options, callback) {
  this.pushState({
    paramOrdinal: undefined,
    paramName: undefined
  });

  return readParamOrdinal;
};

function readParamOrdinal() {
  if (!this.bytesAvailable(2)) {
    return;
  }

  const state = this.currentState();
  state.paramOrdinal = this.readUInt16LE();
  this.consumeBytes(2);

  return readParamName;
}

function readParamName() {
  if (!this.bytesAvailable(1)) {
    return;
  }

  const length = this.readUInt8() * 2;
  if (!this.bytesAvailable(1 + length)) {
    return;
  }

  const paramName = this.readString('ucs2', 1, length);
  this.consumeBytes(1 + length);

  const state = this.currentState();
  if (paramName.charAt(0) === '@') {
    state.paramName = paramName.slice(1);
  } else {
    state.paramName = paramName;
  }

  return metadataParse.call(this, this, afterMetadataParse);;
}

function afterMetadataParse() {
  const metadata = this.currentState();
  return valueParse.call(this, this, metadata, afterValueParse);
}

function afterValueParse() {
  const value = this.popState().value;
  const metadata = this.popState();
  const other = this.popState();

  this.push({
    name: 'RETURNVALUE',
    event: 'returnValue',
    paramOrdinal: other.paramOrdinal,
    paramName: other.paramName,
    value: value,
    metadata: metadata
  });

  return this.parseNextToken;
}
