import { Transform } from 'stream';

import Debug from '../../src/debug';
import Message from '../../src/message';
import { Packet, HEADER_LENGTH } from '../../src/packet';
import { ConnectionError } from '../../src/errors';

/**
  IncomingMessageStream

  Push-based message parser, used by tests to play the server side of a
  connection. (tedious itself reads messages with `IncomingMessageReader`.)
*/
class IncomingMessageStream extends Transform {
  declare debug: Debug;
  declare buffered: Buffer;
  declare currentMessage: Message | undefined;

  constructor(debug: Debug) {
    super({ readableObjectMode: true });

    this.debug = debug;

    this.currentMessage = undefined;
    this.buffered = Buffer.alloc(0);
  }

  pause() {
    super.pause();

    if (this.currentMessage) {
      this.currentMessage.pause();
    }

    return this;
  }

  resume() {
    super.resume();

    if (this.currentMessage) {
      this.currentMessage.resume();
    }

    return this;
  }

  processBufferedData(callback: (err?: ConnectionError) => void) {
    // The packet header is always 8 bytes of length.
    while (this.buffered.length >= HEADER_LENGTH) {
      // Get the full packet length
      const length = this.buffered.readUInt16BE(2);
      if (length < HEADER_LENGTH) {
        return callback(new ConnectionError('Unable to process incoming packet'));
      }

      if (this.buffered.length >= length) {
        const data = this.buffered.subarray(0, length);
        this.buffered = this.buffered.subarray(length);

        // TODO: Get rid of creating `Packet` instances here.
        const packet = new Packet(data);
        this.debug.packet('Received', packet);
        this.debug.data(packet);

        let message = this.currentMessage;
        if (message === undefined) {
          this.currentMessage = message = new Message({ type: packet.type(), resetConnection: false });
          this.push(message);
        }

        if (packet.isLast()) {
          // Wait until the current message was fully processed before we
          // continue processing any remaining messages.
          message.once('end', () => {
            this.currentMessage = undefined;
            this.processBufferedData(callback);
          });
          message.end(packet.data());
          return;
        } else if (!message.write(packet.data())) {
          // If too much data is buffering up in the
          // current message, wait for it to drain.
          message.once('drain', () => {
            this.processBufferedData(callback);
          });
          return;
        }
      } else {
        break;
      }
    }

    // Not enough data to read the next packet. Stop here and wait for
    // the next call to `_transform`.
    callback();
  }

  _transform(chunk: Buffer, _encoding: string, callback: () => void) {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    this.processBufferedData(callback);
  }
}

export default IncomingMessageStream;
module.exports = IncomingMessageStream;
