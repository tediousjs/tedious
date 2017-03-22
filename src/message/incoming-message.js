'use strict';

const PassThrough = require('readable-stream').PassThrough;

/**
  IncomingMessage

  A stream containing the raw contents of a TDS message,
  extracted from a stream of TDS packets.
*/
module.exports = class IncomingMessage extends PassThrough {
  constructor(type) {
    super({ objectMode: true });

    this.type = type;
  }
};
