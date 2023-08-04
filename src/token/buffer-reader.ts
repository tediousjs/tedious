import Parser from './stream-parser';

class NotEnoughDataError extends Error { }


export default class BufferReader {
  private offset: number;
  parser: Parser;

  constructor(parser: Parser) {
    this.offset = parser.position;
    this.parser = parser;
  }

  private checkDataLength(buffer: Buffer, numBytes: number): void {
    if (buffer.length < this.parser.position + numBytes) {
      this.parser.position = this.offset;
      throw new NotEnoughDataError();
    }
  }

  readUInt8(): number {
    const numBytes = 1;
    this.checkDataLength(this.parser.buffer, numBytes);
    const data = this.parser.buffer.readUInt8(this.parser.position);
    this.parser.position += numBytes;
    return data;
  }

  readUInt16LE(): number {
    const numBytes = 2;
    this.checkDataLength(this.parser.buffer, numBytes);
    const data = this.parser.buffer.readUInt16LE(this.parser.position);
    this.parser.position += numBytes;
    return data;
  }

  readUInt32LE(): number {
    const numBytes = 4;
    this.checkDataLength(this.parser.buffer, numBytes);
    const data = this.parser.buffer.readUInt32LE(this.parser.position);
    this.parser.position += numBytes;
    return data;
  }

  readUInt32BE(): number {
    const numBytes = 4;
    this.checkDataLength(this.parser.buffer, numBytes);
    const data = this.parser.buffer.readUInt32BE(this.parser.position);
    this.parser.position += numBytes;
    return data;
  }

  readInt32LE(): number {
    const numBytes = 4;
    this.checkDataLength(this.parser.buffer, numBytes);
    const data = this.parser.buffer.readInt32LE(this.parser.position);
    this.parser.position += numBytes;
    return data;
  }

  readBVarChar(): string {
    const numBytes = this.readUInt8() * 2;
    const data = this.readFromBuffer(numBytes).toString('ucs2');
    return data;
  }


  readUsVarChar(): string {
    const numBytes = this.readUInt16LE() * 2;
    const data = this.readFromBuffer(numBytes).toString('ucs2');
    return data;
  }

  readFromBuffer(numBytes: number): Buffer {
    this.checkDataLength(this.parser.buffer, numBytes);
    const result = this.parser.buffer.slice(this.parser.position, this.parser.position + numBytes);
    this.parser.position += numBytes;
    return result;
  }

}

module.exports = BufferReader;
