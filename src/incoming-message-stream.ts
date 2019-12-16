import BufferList from 'bl';
import { Transform } from 'readable-stream';

import Debug from './debug';
import Message from './message';
import { Packet, HEADER_LENGTH } from './packet';

/**
  IncomingMessageStream
  Transform received TDS data into individual IncomingMessage streams.
*/
class IncomingMessageStream extends Transform {
  debug: Debug;
  bl: any;
  currentMessage: Message | undefined;

  constructor(debug: Debug) {
    super({ readableObjectMode: true });

    this.debug = debug;

    this.currentMessage = undefined;
    this.bl = new BufferList();
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
    this.bl.append(chunk);
    this.processBufferedData(callback);
  }
}

export default IncomingMessageStream;
module.exports = IncomingMessageStream;
