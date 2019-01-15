// @flow

const BufferList = require('bl');
const { Duplex } = require('readable-stream');

const { Packet, HEADER_LENGTH } = require('./packet');

import type Debug from './debug';
import type Message from './message';

class OutgoingMessageStream extends Duplex {
  packetSize: number;
  debug: Debug;
  bl: BufferList;

  constructor(debug: Debug, { packetSize } : { packetSize: number }) {
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

  _write(message: Message, encoding: void, callback: (?Error) => void) {
    const length = this.packetSize - HEADER_LENGTH;
    let packetNumber = 0;

    this.currentMessage = message;
    this.currentMessage.on('data', (data) => {
      if (this.currentMessage.ignore) {
        return;
      }

      this.bl.append(data);

      while (this.bl.length > length) {
        const data = this.bl.slice(0, length);
        this.bl.consume(length);

        // TODO: Get rid of creating `Packet` instances here.
        const packet = new Packet(message.type);
        packet.packetId(packetNumber += 1);
        packet.resetConnection(message.resetConnection);
        packet.addData(data);

        this.debug.packet('Sent', packet);
        this.debug.data(packet);

        if (this.push(packet.buffer) === false) {
          this.currentMessage.pause();
        }
      }
    });

    this.currentMessage.on('end', () => {
      const data = this.bl.slice();
      this.bl.consume(data.length);

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

  _read(size: number) {
    // If we do have a message, resume it and get data flowing.
    // Otherwise, there is nothing to do.
    if (this.currentMessage) {
      this.currentMessage.resume();
    }
  }
}

module.exports = OutgoingMessageStream;
