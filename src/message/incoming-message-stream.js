const Transform = require('readable-stream').Transform;
const BufferList = require('bl');

const IncomingMessage = require('./incoming-message');
const { Packet, HEADER_LENGTH } = require('../packet');

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
  }

  processBufferedData(callback) {
    // The packet header is always 8 bytes of length.
    while (this.bl.length >= HEADER_LENGTH) {
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
          this.currentMessage.end(packet.data());
          this.currentMessage = undefined;
        } else {
          // If too much data is buffering up in the
          // current message, wait for it to drain.
          if (!this.currentMessage.write(packet.data())) {
            this.currentMessage.once('drain', () => {
              this.processBufferedData(callback);
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
    callback();
  }

  _transform(chunk, encoding, callback) {
    this.bl.append(chunk);
    this.processBufferedData(callback);
  }
};
