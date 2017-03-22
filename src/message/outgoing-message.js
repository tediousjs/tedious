'use strict';

const Transform = require('readable-stream').Transform;

const Packet = require('../packet').Packet;
const HEADER_LENGTH = require('../packet').HEADER_LENGTH;

/**
  OutgoingMessage

  This class can be used to transform the raw contents of a single
  TDS message into a stream of TDS packets.
*/
module.exports = class OutgoingMessage extends Transform {
  constructor(type, resetConnection, packetDataSize) {
    super({ readableObjectMode: true });

    this.type = type;
    this.resetConnection = resetConnection;
    this.packetDataSize = packetDataSize - HEADER_LENGTH;
    this.packetNumber = 0;

    this.buffer = new Buffer(0);
    this.bufferOffset = 0;
  }

  _transform(chunk, encoding, callback) {
    if (this.bufferOffset === this.buffer.length) {
      // If we have fully consumed the previous buffer,
      // we can just replace it with the new chunk
      this.buffer = chunk;
    } else {
      // If we haven't fully consumed the previous buffer,
      // we create a new buffer to hold the leftovers and the new chunk.
      const newBuffer = new Buffer(chunk.length + this.buffer.length - this.bufferOffset);

      this.buffer.copy(newBuffer, 0, this.bufferOffset);
      chunk.copy(newBuffer, this.buffer.length - this.bufferOffset);

      this.buffer = newBuffer;
    }

    this.bufferOffset = 0;

    const bufferLength = this.buffer.length;

    // We use `<` instead of `<=` here so we always
    // have a bit of data leftover that can be flushed
    // when the transform is `end()`ed via `_flush()`
    // and thus will be marked as the `last`
    // packet in the message.
    while (this.bufferOffset + this.packetDataSize < bufferLength) {
      // TODO: Remove use of `Packet`, pushing buffers instead.
      const packet = new Packet(this.type);
      packet.last(false);
      packet.resetConnection(this.resetConnection);
      packet.packetId(this.packetNumber += 1);
      packet.addData(this.buffer.slice(this.bufferOffset, this.bufferOffset += this.packetDataSize));

      this.push(packet);
    }

    callback();
  }

  _flush(callback) {
    const packet = new Packet(this.type);
    packet.last(true);
    packet.resetConnection(this.resetConnection);
    packet.packetId(this.packetNumber + 1);
    packet.addData(this.buffer.slice(this.bufferOffset));
    this.push(packet);

    callback();
  }
};
