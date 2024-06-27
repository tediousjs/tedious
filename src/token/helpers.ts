export class Result<T> {
  declare value: T;
  declare offset: number;

  constructor(value: T, offset: number) {
    this.value = value;
    this.offset = offset;
  }
}

export class NotEnoughDataError extends Error {
  byteCount: number;

  constructor(byteCount: number) {
    super();

    this.byteCount = byteCount;
  }
}

export function readUInt8(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 1) {
    throw new NotEnoughDataError(offset + 1);
  }

  return new Result(buf.readUInt8(offset), offset + 1);
}

export function readUInt16LE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 2) {
    throw new NotEnoughDataError(offset + 2);
  }

  return new Result(buf.readUInt16LE(offset), offset + 2);
}

export function readUInt16BE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 2) {
    throw new NotEnoughDataError(offset + 2);
  }

  return new Result(buf.readUInt16BE(offset), offset + 2);
}

export function readInt16LE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 2) {
    throw new NotEnoughDataError(offset + 2);
  }

  return new Result(buf.readInt16LE(offset), offset + 2);
}

export function readUInt24LE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 3) {
    throw new NotEnoughDataError(offset + 3);
  }

  return new Result(buf.readUIntLE(offset, 3), offset + 3);
}

export function readUInt32LE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 4) {
    throw new NotEnoughDataError(offset + 4);
  }

  return new Result(buf.readUInt32LE(offset), offset + 4);
}

export function readUInt32BE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 4) {
    throw new NotEnoughDataError(offset + 4);
  }

  return new Result(buf.readUInt32BE(offset), offset + 4);
}

export function readUInt40LE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 5) {
    throw new NotEnoughDataError(offset + 5);
  }

  return new Result(buf.readUIntLE(offset, 5), offset + 5);
}
export function readInt32LE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 4) {
    throw new NotEnoughDataError(offset + 4);
  }

  return new Result(buf.readInt32LE(offset), offset + 4);
}

export function readBigUInt64LE(buf: Buffer, offset: number): Result<bigint> {
  offset = +offset;

  if (buf.length < offset + 8) {
    throw new NotEnoughDataError(offset + 8);
  }

  return new Result(buf.readBigUInt64LE(offset), offset + 8);
}

export function readBigInt64LE(buf: Buffer, offset: number): Result<bigint> {
  offset = +offset;

  if (buf.length < offset + 8) {
    throw new NotEnoughDataError(offset + 8);
  }

  return new Result(buf.readBigInt64LE(offset), offset + 8);
}

export function readFloatLE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 4) {
    throw new NotEnoughDataError(offset + 4);
  }

  return new Result(buf.readFloatLE(offset), offset + 4);
}

export function readDoubleLE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 8) {
    throw new NotEnoughDataError(offset + 8);
  }

  return new Result(buf.readDoubleLE(offset), offset + 8);
}

export function readBVarChar(buf: Buffer, offset: number): Result<string> {
  offset = +offset;

  let charCount;
  ({ offset, value: charCount } = readUInt8(buf, offset));

  const byteLength = charCount * 2;

  if (buf.length < offset + byteLength) {
    throw new NotEnoughDataError(offset + byteLength);
  }

  return new Result(buf.toString('ucs2', offset, offset + byteLength), offset + byteLength);
}

export function readBVarByte(buf: Buffer, offset: number): Result<Buffer> {
  offset = +offset;

  let byteLength;
  ({ offset, value: byteLength } = readUInt8(buf, offset));

  if (buf.length < offset + byteLength) {
    throw new NotEnoughDataError(offset + byteLength);
  }

  return new Result(buf.slice(offset, offset + byteLength), offset + byteLength);
}

export function readUsVarChar(buf: Buffer, offset: number): Result<string> {
  offset = +offset;

  let charCount;
  ({ offset, value: charCount } = readUInt16LE(buf, offset));

  const byteLength = charCount * 2;

  if (buf.length < offset + byteLength) {
    throw new NotEnoughDataError(offset + byteLength);
  }

  return new Result(buf.toString('ucs2', offset, offset + byteLength), offset + byteLength);
}

export function readUsVarByte(buf: Buffer, offset: number): Result<Buffer> {
  offset = +offset;

  let byteLength;
  ({ offset, value: byteLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + byteLength) {
    throw new NotEnoughDataError(offset + byteLength);
  }

  return new Result(buf.slice(offset, offset + byteLength), offset + byteLength);
}

export function readUNumeric64LE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 8) {
    throw new NotEnoughDataError(offset + 8);
  }

  const low = buf.readUInt32LE(offset);
  const high = buf.readUInt32LE(offset + 4);

  return new Result((0x100000000 * high) + low, offset + 8);
}

export function readUNumeric96LE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 12) {
    throw new NotEnoughDataError(offset + 12);
  }

  const dword1 = buf.readUInt32LE(offset);
  const dword2 = buf.readUInt32LE(offset + 4);
  const dword3 = buf.readUInt32LE(offset + 8);

  return new Result(dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3), offset + 12);
}

export function readUNumeric128LE(buf: Buffer, offset: number): Result<number> {
  offset = +offset;

  if (buf.length < offset + 16) {
    throw new NotEnoughDataError(offset + 16);
  }

  const dword1 = buf.readUInt32LE(offset);
  const dword2 = buf.readUInt32LE(offset + 4);
  const dword3 = buf.readUInt32LE(offset + 8);
  const dword4 = buf.readUInt32LE(offset + 12);

  return new Result(dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3) + (0x100000000 * 0x100000000 * 0x100000000 * dword4), offset + 16);
}
