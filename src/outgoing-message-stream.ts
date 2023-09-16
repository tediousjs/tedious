import BufferList from 'bl';
import { Duplex } from 'stream';

import Debug from './debug';
import Message from './message';
import { Packet, HEADER_LENGTH } from './packet';
import { MessageBuilder } from './message-builder';

class OutgoingMessageStream extends Duplex {
  packetSize: number;
  debug: Debug;
  bl: any;

  currentMessage: Message | undefined;

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
    this.currentMessage = message;

    const builder = new MessageBuilder(message.type, this.packetSize);

    this.currentMessage.on('data', (data: Buffer) => {
      if (message.ignore) {
        return;
      }

      builder.writeBuffer(data);

      let needsPause = false;

      let packet;
      while (packet = builder.flushableBuffers.shift()) {
        needsPause = this.push(packet) === false;
      }

      if (needsPause) {
        message.pause();
      }
    });

    this.currentMessage.on('end', () => {
      if (message.ignore) {
        builder.abort();
      } else {
        builder.finalize();
      }

      let packet;
      while (packet = builder.flushableBuffers.shift()) {
        this.push(packet);
      }

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
