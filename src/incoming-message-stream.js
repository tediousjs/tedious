// @flow

const BufferList = require('bl');
const { Transform } = require('stream');

const Message = require('./message');
const { Packet, HEADER_LENGTH } = require('./packet');

import type Debug from './debug';

/**
  IncomingMessageStream
  Transform received TDS data into individual IncomingMessage streams.
*/
class IncomingMessageStream extends Transform {
  debug: Debug;
  bl: BufferList;
  currentMessage: Message | typeof undefined;

  constructor(debug: Debug) {
    super({ readableObjectMode: true });

    this.debug = debug;

    this.currentMessage = undefined;
    this.bl = new BufferList();
  }

  processBufferedData(callback: () => void) {
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

        let message = this.currentMessage;
        if (message === undefined) {
          message = new Message({ type: packet.type(), resetConnection: false });
          this.push(message);
        }

        if (packet.isLast()) {
          this.currentMessage = undefined;
          // Wait until the current message was fully processed before we
          // continue processing any remaining messages.
          message.once('end', () => {
            this.processBufferedData(callback);
          });
          message.end(packet.data());
          return;
        } else {
          this.currentMessage = message;
          // If too much data is buffering up in the
          // current message, wait for it to drain.
          if (!message.write(packet.data())) {
            message.once('drain', () => {
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

  _transform(chunk: Buffer, encoding: void, callback: () => void) {
    this.bl.append(chunk);
    this.processBufferedData(callback);
  }
}

module.exports = IncomingMessageStream;
