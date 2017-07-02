const Transform = require('readable-stream').Transform;

const { Packet, HEADER_LENGTH, isValidType } = require('../packet');

const BufferList = require('bl');

/**
  OutgoingMessage

  This class can be used to transform the raw contents of a single
  TDS message into a stream of TDS packets.
*/
module.exports = class OutgoingMessage extends Transform {
  constructor(type, resetConnection, packetSize, debug) {
    super();

    if (!isValidType(type)) {
      throw new TypeError('"type" must be a a supported TDS message type');
    }

    if (typeof packetSize !== 'number' || packetSize <= HEADER_LENGTH) {
      throw new TypeError(`"packetSize" must be a number greater than ${HEADER_LENGTH}`);
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
      this.transformNextPacket();
    }

    callback();
  }

  logPacket(packet) {
    this.debug.packet('Sent', packet);
    this.debug.data(packet);
  }

  transformNextPacket(isLast = false) {
    const packet = new Packet(this.type);
    packet.last(isLast);
    packet.resetConnection(this.resetConnection);
    packet.packetId(this.packetNumber += 1);
    packet.addData(this.bl.slice(0, this.packetDataSize));
    this.bl.consume(this.packetDataSize);

    this.logPacket(packet);

    this.push(packet.buffer);
  }

  _flush(callback) {
    this.transformNextPacket(true);
    callback();
  }
};
