'use strict';

// s2.2.7.16

module.exports = function() {
  if (!this.bytesAvailable(4)) {
    return;
  }

  this.push({
    name: 'RETURNSTATUS',
    event: 'returnStatus',
    value: this.buffer.readInt32LE(this.position, true),
  });

  this.consumeBytes(4);

  return this.parseNextToken;
};
