import BufferList from 'bl';
import { Duplex } from 'readable-stream';

import Debug from './debug';
import Message from './message';
import { Packet, HEADER_LENGTH } from './packet';

import { packetTransform } from './packet-transform';

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

    (async () => {
      for await (const chunk of packetTransform(message, this.debug, this.packetSize)) {
        this.push(chunk);
      }

      this.currentMessage = undefined;

      callback();
    })();
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
