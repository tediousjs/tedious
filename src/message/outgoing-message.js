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
  constructor(type, resetConnection, packetSize, debug) {
    super();

    if (typeof type !== 'number' || type < 1 || type > 18) {
      throw new TypeError('"type" must be a number between 1 and 18');
    }

    if (typeof packetSize !== 'number' || packetSize <= 8) {
      throw new TypeError('"packetSize" must be a number greater than 8');
    }

    this.type = type;
    this.resetConnection = resetConnection;
    this.packetDataSize = packetSize - HEADER_LENGTH;
    this.packetNumber = 0;

    this.debug = debug;

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
      this.bl.consume(this.packetDataSize);

      this.debug.packet('Sent', packet);
      this.debug.data(packet);

      this.push(packet.buffer);
    }

    process.nextTick(callback);
  }

  _flush(callback) {
    const packet = new Packet(this.type);
    packet.last(true);
    packet.packetId(this.packetNumber + 1);
    packet.resetConnection(this.resetConnection);
    packet.addData(this.bl.slice());
    this.bl.consume(this.bl.length);

    this.debug.packet('Sent', packet);
    this.debug.data(packet);

    this.push(packet.buffer);
    process.nextTick(callback);
  }
};
