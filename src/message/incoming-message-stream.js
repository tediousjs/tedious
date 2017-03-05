'use strict';

const Transform = require('readable-stream').Transform;

const IncomingMessage = require('./incoming-message');

const Packet = require('../packet').Packet;
const packetHeaderLength = require('../packet').HEADER_LENGTH;

/**
  IncomingMessageStream

  Transform received TDS data into individual IncomingMessage streams.
*/
module.exports = class IncomingMessageStream extends Transform {
  constructor() {
    super({ readableObjectMode: true });

    this.currentMessage = undefined;
    this.buffer = new Buffer(0);
    this.position = 0;
  }

  _transform(chunk, encoding, callback) {
    if (this.position === this.buffer.length) {
      // If we have fully consumed the previous buffer,
      // we can just replace it with the new chunk
      this.buffer = chunk;
    } else {
      // If we haven't fully consumed the previous buffer,
      // we simply concatenate the leftovers and the new chunk.
      this.buffer = Buffer.concat([
        this.buffer.slice(this.position), chunk
      ], (this.buffer.length - this.position) + chunk.length);
    }

    this.position = 0;

    // The packet header is always 8 bytes of length.
    while (this.buffer.length >= this.position + packetHeaderLength) {
      // Get the full packet length
      const length = this.buffer.readUInt16BE(this.position + 2);

      if (this.buffer.length >= this.position + length) {
        const data = this.buffer.slice(this.position, this.position + length);
        this.position += length;

        // TODO: Get rid of creating `Packet` instances here.
        const packet = new Packet(data);

        if (this.currentMessage === undefined) {
          this.currentMessage = new IncomingMessage(packet.type());
          this.push(this.currentMessage);
        }

        if (packet.isLast()) {
          this.currentMessage.end(packet);
          this.currentMessage = undefined;
        } else {
          this.currentMessage.write(packet);
        }
      } else {
        // Not enough data to read the next packet. Stop here and wait for
        // the next call to `_transform`.
        break;
      }
    }

    callback();
  }
};
