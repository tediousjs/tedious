import BufferList from 'bl';
import { Duplex } from 'stream';

import Debug from './debug';
import Message from './message';
import { Packet, HEADER_LENGTH } from './packet';

class OutgoingMessageStream extends Duplex {
  declare packetSize: number;
  declare debug: Debug;
  declare bl: any;

  declare currentMessage: Message | undefined;

  constructor(debug: Debug, { packetSize }: { packetSize: number }) {
    super({ writableObjectMode: true });

    this.packetSize = packetSize;
    this.debug = debug;
    this.bl = new BufferList();

    // When the writable side is ended, push `null`
    // to also end the readable side.
    this.on('finish', () => {
      this.push(null);
    });
  }

  _write(message: Message, _encoding: string, callback: (err?: Error | null) => void) {
    const length = this.packetSize - HEADER_LENGTH;
    let packetNumber = 0;

    this.currentMessage = message;
    this.currentMessage.on('data', (data: Buffer) => {
      if (message.ignore) {
        return;
      }

      this.bl.append(data);

      while (this.bl.length > length) {
        // Copy the payload directly into the packet buffer, instead of
        // slicing it out of the buffer list and concatenating it onto the
        // header afterwards.
        const packet = Packet.withDataLength(message.type, length);
        this.bl.copy(packet.buffer, HEADER_LENGTH, 0, length);
        this.bl.consume(length);

        packet.packetId(packetNumber += 1);
        packet.resetConnection(message.resetConnection);

        this.debug.packet('Sent', packet);
        this.debug.data(packet);

        if (this.push(packet.buffer) === false) {
          message.pause();
        }
      }
    });

    this.currentMessage.on('end', () => {
      const remaining = this.bl.length;

      const packet = Packet.withDataLength(message.type, remaining);
      this.bl.copy(packet.buffer, HEADER_LENGTH, 0, remaining);
      this.bl.consume(remaining);

      packet.packetId(packetNumber += 1);
      packet.resetConnection(message.resetConnection);
      packet.last(true);
      packet.ignore(message.ignore);

      this.debug.packet('Sent', packet);
      this.debug.data(packet);

      this.push(packet.buffer);

      this.currentMessage = undefined;

      callback();
    });
  }

  _read(_size: number) {
    // If we do have a message, resume it and get data flowing.
    // Otherwise, there is nothing to do.
    if (this.currentMessage) {
      this.currentMessage.resume();
    }
  }
}

export default OutgoingMessageStream;
module.exports = OutgoingMessageStream;
