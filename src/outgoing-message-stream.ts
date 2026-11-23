import { Duplex } from 'stream';

import Debug from './debug';
import Message from './message';
import { Packet, HEADER_LENGTH } from './packet';

class OutgoingMessageStream extends Duplex {
  declare packetSize: number;
  declare debug: Debug;

  declare currentMessage: Message | undefined;

  constructor(debug: Debug, { packetSize }: { packetSize: number }) {
    super({ writableObjectMode: true });

    this.packetSize = packetSize;
    this.debug = debug;

    // When the writable side is ended, push `null`
    // to also end the readable side.
    this.on('finish', () => {
      this.push(null);
    });
  }

  _write(message: Message, _encoding: string, callback: (err?: Error | null) => void) {
    const length = this.packetSize - HEADER_LENGTH;
    let packetNumber = 0;

    // Data of the message that was not sent yet. Always less than one
    // packet's worth once the 'data' handler returns.
    let pending: Buffer[] = [];
    let pendingLength = 0;

    this.currentMessage = message;
    this.currentMessage.on('data', (data: Buffer) => {
      if (message.ignore) {
        return;
      }

      pending.push(data);
      pendingLength += data.length;

      if (pendingLength <= length) {
        return;
      }

      let buffered = pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingLength);

      while (buffered.length > length) {
        const data = buffered.subarray(0, length);
        buffered = buffered.subarray(length);

        // TODO: Get rid of creating `Packet` instances here.
        const packet = new Packet(message.type);
        packet.packetId(packetNumber += 1);
        packet.resetConnection(message.resetConnection);
        packet.addData(data);

        this.debug.packet('Sent', packet);
        this.debug.data(packet);

        if (this.push(packet.buffer) === false) {
          message.pause();
        }
      }

      pending = buffered.length ? [buffered] : [];
      pendingLength = buffered.length;
    });

    this.currentMessage.on('end', () => {
      const data = pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingLength);
      pending = [];
      pendingLength = 0;

      // TODO: Get rid of creating `Packet` instances here.
      const packet = new Packet(message.type);
      packet.packetId(packetNumber += 1);
      packet.resetConnection(message.resetConnection);
      packet.last(true);
      packet.ignore(message.ignore);
      packet.addData(data);

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
