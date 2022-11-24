export type Result<T> =
  { done: true, value: T, offset: number } |
  { done: false, value: undefined, offset: number };

/**
 * Base parser class.
 */
export abstract class Parser<T> {
  /**
   * Parse data in buffer, starting from `offset`.
   *
   * Returns a result denoting whether the parser is done, what value was parsed,
   * and from which offset to continue in the given buffer.
   */
  abstract parse(buffer: Buffer, offset: number): Result<T>
}

/**
 * Execute a sequence of parsers and collect their results.
 */
export class Sequence<I extends [...any[]]> extends Parser<I> {
  index: number;
  list: Parser<any>[];
  result: I;

  constructor(list: { [K in keyof I]: Parser<I[K]> }) {
    super();
    this.index = 0;
    this.list = list;

    this.result = new Array(this.list.length) as I;
  }

  parse(buffer: Buffer, offset: number): Result<I> {
    while (this.index < this.list.length) {
      const r = this.list[this.index].parse(buffer, offset);

      if (!r.done) {
        return r;
      }

      offset = r.offset;
      this.result[this.index] = r.value;
      this.index += 1;
    }

    return { done: true, value: this.result, offset: offset };
  }
}

export class Record<I extends { [key: string]: any }> extends Parser<I> {
  index: number;
  record: { [K in keyof I]: Parser<I[K]> };
  result: I;

  constructor(record: { [K in keyof I]: Parser<I[K]> }) {
    super();

    this.index = 0;
    this.record = record;

    this.result = {} as I;
  }

  parse(buffer: Buffer, offset: number): Result<I> {
    const keys = Object.keys(this.record);

    while (this.index < keys.length) {
      const key = keys[this.index] as keyof I;
      const r = this.record[key].parse(buffer, offset);

      if (!r.done) {
        return r;
      }

      offset = r.offset;
      this.result[key] = r.value;
      this.index += 1;
    }

    return { done: true, value: this.result, offset: offset };
  }
}

/**
 * Transform the result of a parser to a different value.
 */
export class Map<I, O> extends Parser<O> {
  map: (input: I) => O;
  input: Parser<I>;

  constructor(input: Parser<I>, map: (input: I) => O) {
    super();

    this.input = input;
    this.map = map;
  }

  parse(buffer: Buffer, offset: number): Result<O> {
    const r = this.input.parse(buffer, offset);

    if (!r.done) {
      return r;
    }

    const map = this.map;
    return { done: true, value: map(r.value), offset: r.offset };
  }
}

/**
 * Call one parser, and use its result to determine how to continue parsing.
 */
export class FlatMap<I, O> extends Parser<O> {
  value: Parser<I>;
  next: Parser<O> | undefined;
  options: (type: I) => Parser<O>;

  constructor(value: Parser<any>, options: (type: I) => Parser<O>) {
    super();

    this.value = value;
    this.options = options;

    this.next = undefined;
  }

  parse(buffer: Buffer, offset: number): Result<O> {
    if (this.next === undefined) {
      const r = this.value.parse(buffer, offset);

      if (!r.done) {
        return r;
      }

      offset = r.offset;
      this.next = this.options(r.value);
    }

    return this.next!.parse(buffer, offset);
  }
}

export class Int8 extends Parser<number> {
  parse(buffer: Buffer, offset: number): Result<number> {
    if (offset === buffer.length) {
      return { done: false, value: undefined, offset: offset };
    }
    return { done: true, value: buffer.readInt8(offset), offset: offset + 1 };
  }
}

export class UInt8 extends Parser<number> {
  parse(buffer: Buffer, offset: number): Result<number> {
    if (offset === buffer.length) {
      return { done: false, value: undefined, offset: offset };
    }

    return { done: true, value: buffer[offset], offset: offset + 1 };
  }
}

export class Int16LE extends Parser<number> {
  index: number;
  result: 0;

  constructor() {
    super();

    this.index = 0;
    this.result = 0;
  }

  parse(buffer: Buffer, offset: number): Result<number> {
    switch (this.index) {
      case 0: {
        if (offset === buffer.length) {
          return { done: false, value: undefined, offset: offset };
        }

        // Fast path, buffer has all data available
        if (offset + 2 <= buffer.length) {
          return { done: true, value: buffer.readInt16LE(offset), offset: offset + 2 };
        }

        this.result += buffer[offset++];
        this.index += 1;

        // fall through
      }

      case 1: {
        if (offset === buffer.length) {
          return { done: false, value: undefined, offset: offset };
        }

        this.result += buffer[offset++] * 2 ** 8;
        this.index += 1;

        // fall through
      }

      case 2: {
        return { done: true, value: this.result | (this.result & 2 ** 15) * 0x1fffe, offset: offset };
      }

      default:
        throw new Error('unreachable');
    }
  }
}

export class UInt16LE extends Parser<number> {
  index: number;
  result: 0;

  constructor() {
    super();

    this.index = 0;
    this.result = 0;
  }

  parse(buffer: Buffer, offset: number): Result<number> {
    switch (this.index) {
      case 0: {
        if (offset === buffer.length) {
          return { done: false, value: undefined, offset: offset };
        }

        // Fast path, buffer has all data available
        if (offset + 2 <= buffer.length) {
          return { done: true, value: buffer.readUInt16LE(offset), offset: offset + 2 };
        }

        this.result += buffer[offset++];
        this.index += 1;

        // fall through
      }

      case 1: {
        if (offset === buffer.length) {
          return { done: false, value: undefined, offset: offset };
        }

        this.result += buffer[offset++] * 2 ** 8;
        this.index += 1;

        // fall through
      }

      case 2: {
        return { done: true, value: this.result, offset: offset };
      }

      default:
        throw new Error('unreachable');
    }
  }
}

export class Int32LE extends Parser<number> {
  index: number;
  result: 0;

  constructor() {
    super();

    this.index = 0;
    this.result = 0;
  }

  parse(buffer: Buffer, offset: number): Result<number> {
    const dataLength = 4;
    if (this.index === 0) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }

      // Fast path, buffer has all data available
      if (offset + dataLength <= buffer.length) {
        return { done: true, value: buffer.readInt32LE(offset), offset: offset + dataLength };
      }

      this.result += buffer[offset++];
      this.index += 1;
    }

    while (this.index < dataLength) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }

      if (this.index < dataLength - 1) {
        this.result += buffer[offset++] * 2 ** (8 * this.index);
      } else {
        // Last byte
        this.result += buffer[offset++] << (8 * this.index);
      }

      this.index += 1;
    }

    return { done: true, value: this.result, offset: offset };
  }
}

export class Int32BE extends Parser<number> {
  index: number;
  result: 0;

  constructor() {
    super();

    this.index = 0;
    this.result = 0;
  }

  parse(buffer: Buffer, offset: number): Result<number> {
    const dataLength = 4;
    if (this.index === 0) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }

      // Fast path, buffer has all data available
      if (offset + dataLength <= buffer.length) {
        return { done: true, value: buffer.readInt32BE(offset), offset: offset + dataLength };
      }

      this.result += (buffer[offset++] << 24);
      this.index += 1;
    }

    while (this.index < dataLength) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }
      this.result += buffer[offset++] * 2 ** (8 * (3 - this.index));
      this.index += 1;
    }

    return { done: true, value: this.result, offset: offset };
  }
}

export class UInt32LE extends Parser<number> {
  index: number;
  result: 0;

  constructor() {
    super();

    this.index = 0;
    this.result = 0;
  }

  parse(buffer: Buffer, offset: number): Result<number> {
    const dataLength = 4;
    if (this.index === 0) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }

      // Fast path, buffer has all data available
      if (offset + dataLength <= buffer.length) {
        return { done: true, value: buffer.readUInt32LE(offset), offset: offset + dataLength };
      }

      this.result += buffer[offset++];
      this.index += 1;
    }

    while (this.index < dataLength) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }

      this.result += buffer[offset++] * 2 ** (8 * this.index);
      this.index += 1;
    }

    return { done: true, value: this.result, offset: offset };
  }
}

export class UInt32BE extends Parser<number> {
  index: number;
  result: 0;

  constructor() {
    super();

    this.index = 0;
    this.result = 0;
  }

  parse(buffer: Buffer, offset: number): Result<number> {
    const dataLength = 4;
    if (this.index === 0) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }

      // Fast path, buffer has all data available
      if (offset + dataLength <= buffer.length) {
        return { done: true, value: buffer.readUInt32BE(offset), offset: offset + dataLength };
      }

      this.result += buffer[offset++] * 2 ** 24;
      this.index += 1;
    }

    while (this.index < dataLength) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }
      this.result += buffer[offset++] * 2 ** (8 * (3 - this.index));
      this.index += 1;
    }

    return { done: true, value: this.result, offset: offset };
  }
}

export class BigUInt64LE extends Parser<bigint> {
  index: number;
  lo: number;
  hi: number;

  constructor() {
    super();

    this.index = 0;
    this.lo = 0;
    this.hi = 0;
  }

  parse(buffer: Buffer, offset: number): Result<bigint> {
    const dataLength = 8;
    if (this.index === 0) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }

      // Fast path, buffer has all data available
      if (offset + dataLength <= buffer.length) {
        return { done: true, value: buffer.readBigUInt64LE(offset), offset: offset + 8 };
      }

      this.lo += buffer[offset++];
      this.index += 1;
    }

    while (this.index < dataLength / 2) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }

      this.lo += buffer[offset++] * 2 ** (8 * this.index);
      this.index += 1;
    }

    while (this.index < dataLength) {
      if (offset === buffer.length) {
        return { done: false, value: undefined, offset: offset };
      }

      this.hi += buffer[offset++] * 2 ** (8 * (this.index - 4));
      this.index += 1;
    }

    return { done: true, value: BigInt(this.lo) + (BigInt(this.hi) << 32n), offset: offset };
  }
}

class NVarbyte extends Parser<Buffer> {
  length: UInt8 | UInt16LE | UInt32LE;

  chunks: Buffer[] | undefined;
  remainingLength: number | undefined;

  constructor(length: UInt8 | UInt16LE | UInt32LE) {
    super();
    this.length = length;

    this.remainingLength = undefined;
    this.chunks = undefined;
  }

  parse(buffer: Buffer, offset: number): Result<Buffer> {
    if (this.remainingLength === undefined) {
      const r = this.length.parse(buffer, offset);

      if (!r.done) {
        return r;
      }

      offset = r.offset;
      this.remainingLength = r.value;
    }

    if (this.chunks === undefined) {
      // Fast path - we have enough data and can just return the result
      if (offset + this.remainingLength <= buffer.length) {
        return { done: true, value: buffer.slice(offset, offset += this.remainingLength), offset: offset };
      }

      // Slow path, we need to accumulate slices first
      this.chunks = [];
    }

    if (offset + this.remainingLength <= buffer.length) {
      this.chunks.push(buffer.slice(offset, offset + this.remainingLength));
      offset += this.remainingLength;
      this.remainingLength = 0;

      return { done: true, value: Buffer.concat(this.chunks), offset: offset };
    } else {
      this.chunks.push(buffer.slice(offset, buffer.length));
      this.remainingLength -= (buffer.length - offset);
      offset = buffer.length;

      return { done: false, value: undefined, offset: offset };
    }
  }
}

export class BVarbyte extends NVarbyte {
  constructor() {
    super(new UInt8());
  }
}

export class UsVarbyte extends NVarbyte {
  constructor() {
    super(new UInt16LE());
  }
}

export class LVarbyte extends NVarbyte {
  constructor() {
    super(new UInt32LE());
  }
}

class NVarchar extends Parser<string> {
  length: UInt8 | UInt16LE | UInt32LE;

  chunks: Buffer[] | undefined;
  remainingLength: number | undefined;

  constructor(length: UInt8 | UInt16LE | UInt32LE) {
    super();
    this.length = length;

    this.remainingLength = undefined;
    this.chunks = undefined;
  }

  parse(buffer: Buffer, offset: number): Result<string> {
    if (this.remainingLength === undefined) {
      const r = this.length.parse(buffer, offset);

      if (!r.done) {
        return r;
      }

      offset = r.offset;
      this.remainingLength = r.value * 2;
    }

    if (this.chunks === undefined) {
      // Fast path - we have enough data and can just return the result
      if (offset + this.remainingLength <= buffer.length) {
        return { done: true, value: buffer.toString('ucs2', offset, offset += this.remainingLength), offset: offset };
      }

      // Slow path, we need to accumulate slices first
      this.chunks = [];
    }

    if (offset + this.remainingLength <= buffer.length) {
      this.chunks.push(buffer.slice(offset, offset + this.remainingLength));
      offset += this.remainingLength;
      this.remainingLength = 0;

      return { done: true, value: Buffer.concat(this.chunks).toString('ucs2'), offset: offset };
    } else {
      this.chunks.push(buffer.slice(offset, buffer.length));
      this.remainingLength -= (buffer.length - offset);
      offset = buffer.length;

      return { done: false, value: undefined, offset: offset };
    }
  }
}

export class BVarchar extends NVarchar {
  constructor() {
    super(new UInt8());
  }
}

export class UsVarchar extends NVarchar {
  constructor() {
    super(new UInt16LE());
  }
}
