import BufferList from 'bl';
import { Transform } from 'stream';

import Debug from './debug';
import IncomingMessage from './incoming-message';
import { Packet, HEADER_LENGTH } from './packet';
import { ConnectionError } from './errors';

/**
  IncomingMessageStream
  Transform received TDS data into individual IncomingMessage objects.

  The data of each message is written to the message as its packets arrive.
  Processing of further packets is held back while a message's consumer
  cannot accept more data, which propagates as backpressure to the socket.
*/
class IncomingMessageStream extends Transform {
  declare debug: Debug;
  declare bl: any;
  declare currentMessage: IncomingMessage | undefined;

  constructor(debug: Debug) {
    super({ readableObjectMode: true });

    this.debug = debug;

    this.currentMessage = undefined;
    this.bl = new BufferList();
  }

  processBufferedData(callback: (err?: ConnectionError) => void) {
    // The packet header is always 8 bytes of length.
    while (this.bl.length >= HEADER_LENGTH) {
      // Get the full packet length
      const length = this.bl.readUInt16BE(2);
      if (length < HEADER_LENGTH) {
        return callback(new ConnectionError('Unable to process incoming packet'));
      }

      if (this.bl.length < length) {
        break;
      }

      const data = this.bl.slice(0, length);
      this.bl.consume(length);

      // TODO: Get rid of creating `Packet` instances here.
      const packet = new Packet(data);
      this.debug.packet('Received', packet);
      this.debug.data(packet);

      let message = this.currentMessage;
      if (message === undefined) {
        this.currentMessage = message = new IncomingMessage({ type: packet.type() });
        this.push(message);
      }

      const accepted = message.write(packet.data());

      if (packet.isLast()) {
        this.currentMessage = undefined;
        message.end();
      }

      if (!accepted) {
        // The message's consumer cannot accept more data right now. Wait
        // until it can before processing any further packets.
        message.onDrain = () => {
          this.processBufferedData(callback);
        };
        return;
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
