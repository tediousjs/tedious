'use strict';

const Transform = require('readable-stream').Transform;

const IncomingMessage = require('./incoming-message');

const BufferList = require('bl');

const Packet = require('../packet').Packet;
const packetHeaderLength = require('../packet').HEADER_LENGTH;

/**
  IncomingMessageStream

  Transform received TDS data into individual IncomingMessage streams.
*/
module.exports = class IncomingMessageStream extends Transform {
  constructor(debug) {
    super({ readableObjectMode: true });

    this.debug = debug;

    this.currentMessage = undefined;
    this.bl = new BufferList();

    this.waitForNextChunk = undefined;
  }

  processBufferedData() {
    // The packet header is always 8 bytes of length.
    while (this.bl.length >= packetHeaderLength) {
      // Get the full packet length
      const length = this.bl.readUInt16BE(2);

      if (this.bl.length >= length) {
        const data = this.bl.slice(0, length);
        this.bl.consume(length);

        // TODO: Get rid of creating `Packet` instances here.
        const packet = new Packet(data);
        this.debug.packet('Received', packet);
        this.debug.data(packet);

        if (this.currentMessage === undefined) {
          this.currentMessage = new IncomingMessage(packet.type());
          this.push(this.currentMessage);
        }

        if (packet.isLast()) {
          this.currentMessage.end(packet);
          this.currentMessage = undefined;
        } else {
          // If too much data is buffering up in the
          // current message, wait for it to drain.
          if (!this.currentMessage.write(packet)) {
            this.currentMessage.once('drain', () => {
              this.processBufferedData();
            });
            return;
          }
        }
      } else {
        break;
      }
    }

    // Not enough data to read the next packet. Stop here and wait for
    // the next call to `_transform`.
    this.waitForNextChunk();
  }

  _transform(chunk, encoding, callback) {
    this.bl.append(chunk);

    this.waitForNextChunk = () => { callback(); };
    this.processBufferedData();
  }

  _flush(callback) {
    if (this.bl.length) {
      // If the buffer was not fully consumed, the message stream
      // ended prematurely.
      return callback(new Error('Incoming message stream ended prematurely'));
    }

    callback();
  }
};
