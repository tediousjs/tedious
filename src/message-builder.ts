import { OFFSET, STATUS } from './packet';

export class MessageBuilder {
  packetSize: number;
  flushableBuffers: Buffer[];
  offset: number;
  buf: Buffer;
  type: number;
  packetId: number;
  status: number;

  constructor(type: number, packetSize: number) {
    this.packetSize = packetSize;
    this.type = type;
    this.status = 0;

    this.flushableBuffers = [];

    this.packetId = 1;

    this.buf = Buffer.alloc(packetSize);
    this.writePacketHeader();
  }

  expand() {
    this.flushableBuffers.push(this.buf);

    this.packetId += 1;

    this.buf = Buffer.alloc(this.packetSize);
    this.writePacketHeader();
  }

  finalize() {
    this.buf.writeUInt8(STATUS.EOM, OFFSET.Status);
    this.buf.writeUInt16BE(this.offset, OFFSET.Length);

    this.flushableBuffers.push(this.buf.slice(0, this.offset));
    this.buf = Buffer.alloc(0);
    this.offset = 0;
  }

  abort() {
    this.buf.writeUInt8(STATUS.EOM | STATUS.IGNORE, OFFSET.Status);
    this.buf.writeUInt16BE(8, OFFSET.Length);

    this.flushableBuffers.push(this.buf.slice(0, 8));
    this.buf = Buffer.alloc(0);
    this.offset = 0;
  }

  writePacketHeader() {
    this.buf.writeUInt8(this.type, OFFSET.Type);
    this.buf.writeUInt8(STATUS.NORMAL, OFFSET.Status);
    this.buf.writeUInt16BE(0, OFFSET.SPID);
    this.buf.writeUInt16BE(this.packetSize, OFFSET.Length);
    this.buf.writeUInt8(this.packetId, OFFSET.PacketID);
    this.buf.writeUInt8(0, OFFSET.Window);

    this.offset = 8;
  }

  writeUInt8(value: number) {
    value = +value;

    if (this.buf.length === this.offset) {
      this.expand();
    }
    this.buf[this.offset++] = value;
  }

  writeUInt16LE(value: number) {
    value = +value;

    this.writeUInt8(value);
    value = value >>> 8;

    this.writeUInt8(value);
    value = value >>> 8;
  }

  writeUInt32LE(value: number) {
    value = +value;

    this.writeUInt8(value);
    value = value >>> 8;

    this.writeUInt8(value);
    value = value >>> 8;

    this.writeUInt8(value);
    value = value >>> 8;
  }

  writeBuffer(value: Buffer) {
    if (value.length < this.packetSize - this.offset) {
      value.copy(this.buf, this.offset);
      this.offset += value.length;
      return;
    }

    let offset = 0;
    while (value.length - offset > this.packetSize - this.offset) {
      value.copy(this.buf, this.offset, offset, offset + (this.packetSize - this.offset));
      offset += this.packetSize - this.offset;
      this.offset += this.packetSize - this.offset;

      this.expand();
    }

    if (value.length - offset > 0) {
      value.copy(this.buf, this.offset, offset);
      this.offset += value.length - offset;
    }
  }
}

const builder = new MessageBuilder(1, 20);
builder.writeBuffer(Buffer.alloc(30));
builder.finalize();

console.log(builder);
