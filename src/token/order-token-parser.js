'use strict';

// s2.2.7.14

module.exports = function() {
  if (!this.bytesAvailable(2)) {
    return;
  }

  const length = this.readUInt16LE();
  if (!this.bytesAvailable(2 + length)) {
    return;
  }

  const orderColumns = [];

  let offset = 2;
  for (let i = 0, len = length / 2; i < len; i++) {
    orderColumns.push(this.readUInt16LE(offset));
    offset += 2;
  }

  this.consumeBytes(offset);

  this.push({
    name: 'ORDER',
    event: 'order',
    orderColumns: orderColumns
  });

  return this.parseNextToken;
};
