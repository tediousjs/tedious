const Transform = require('readable-stream').Transform;

/**
  IncomingMessage

  A stream containing the raw contents of a TDS message,
  extracted from a stream of TDS packets.
*/
module.exports = class IncomingMessage extends Transform {
  constructor(type) {
    super({ writableObjectMode: true });

    this.type = type;
  }

  _transform(packet, encoding, callback) {
    callback(null, packet.data());
  }
};
