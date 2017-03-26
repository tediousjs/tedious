'use strict';

const Transform = require('readable-stream').Transform;

const Packet = require('../packet').Packet;
const HEADER_LENGTH = require('../packet').HEADER_LENGTH;

const BufferList = require('bl');

/**
  OutgoingMessage

  This class can be used to transform the raw contents of a single
  TDS message into a stream of TDS packets.
*/
module.exports = class OutgoingMessage extends Transform {
  constructor(type, resetConnection, packetSize) {
    super({ readableObjectMode: true });

    this.type = type;
    this.resetConnection = resetConnection;
    this.packetDataSize = packetSize - HEADER_LENGTH;
    this.packetNumber = 0;

    this.bl = new BufferList();
  }

  _transform(chunk, encoding, callback) {
    this.bl.append(chunk);

    while (this.packetDataSize < this.bl.length) {
      const packet = new Packet(this.type);
      packet.last(false);
      packet.resetConnection(this.resetConnection);
      packet.packetId(this.packetNumber += 1);
      packet.addData(this.bl.slice(0, this.packetDataSize));
      this.push(packet);

      this.bl.consume(this.packetDataSize);
    }

    callback();
  }

  _flush(callback) {
    const packet = new Packet(this.type);
    packet.last(true);
    packet.packetId(this.packetNumber + 1);
    packet.resetConnection(this.resetConnection);
    packet.addData(this.bl.slice());
    this.bl.consume(this.bl.length);

    this.push(packet);
    callback();
  }
};
