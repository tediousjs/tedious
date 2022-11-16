
export type Result<T> =
  { done: true, value: T, offset: number } |
  { done: false, value: undefined, offset: number };

export abstract class Parser<T> {
  abstract parse(buffer: Buffer, offset: number): Result<T>
}

export class Sequence<I extends [...any[]]> extends Parser<I> {
  index: number;
  list: Parser<any>[];
  result: I;

  constructor(list: { [K in keyof I]: Parser<I[K]> }) {
    super();
    this.index = 0;
    this.list = list;

    this.result = [] as unknown as I;
  }

  parse(buffer: Buffer, offset: number): Result<I> {
    while (this.index < this.list.length) {
      const r = this.list[this.index].parse(buffer, offset);
      offset = r.offset;

      if (!r.done) {
        return { done: false, value: undefined, offset: offset };
      }

      this.result[this.index] = r.value;
      this.index += 1;
    }

    return { done: true, value: this.result, offset: offset };
  }
}

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

    const r = this.next!.parse(buffer, offset);
    offset = r.offset;

    if (r.done) {
      return { done: r.done, value: r.value, offset: offset };
    } else {
      return { done: false, value: undefined, offset: offset };
    }
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

export class UInt32LE extends Parser<number> {
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
        if (offset === buffer.length) {
          return { done: false, value: undefined, offset: offset };
        }

        this.result += buffer[offset++] * 2 ** 16;
        this.index += 1;

        // fall through
      }

      case 3: {
        if (offset === buffer.length) {
          return { done: false, value: undefined, offset: offset };
        }

        this.result += buffer[offset++] * 2 ** 32;
        this.index += 1;

        // fall through
      }

      case 4: {
        return { done: true, value: this.result, offset: offset };
      }

      default:
        throw new Error('unreachable');
    }
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
      offset = r.offset;

      if (!r.done) {
        return { done: false, value: undefined, offset: offset };
      }

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
      offset = r.offset;

      if (!r.done) {
        return { done: false, value: undefined, offset: offset };
      }

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
