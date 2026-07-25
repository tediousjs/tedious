import iconv from 'iconv-lite';

/**
 * Decodes a slice of `buf` into a string, using the given character set.
 */
export type CharsetDecoder = (buf: Buffer, start: number, end: number) => string;

const decoders = new Map<string, CharsetDecoder>();

function iconvDecoder(encoding: string): CharsetDecoder {
  return (buf, start, end) => iconv.decode(buf.subarray(start, end), encoding);
}

// Builds a decoder for `encoding`.
//
// `iconv-lite`'s single byte decoder allocates a scratch buffer and walks the
// input one byte at a time, which makes it around an order of magnitude slower
// than `Buffer#toString('latin1')`. For a single byte character set we can use
// `latin1` directly and afterwards patch up only those byte values that do not
// map to the code point of the same numeric value.
//
// Two conditions have to hold before that shortcut is safe. First, the codec
// has to actually be one of `iconv-lite`'s single byte codecs - those, and only
// those, carry a 512 byte `decodeBuf` holding one UTF-16 code unit per byte
// value. Multi-byte character sets (`CP932`, `CP936`, `CP949`, `CP950`) and
// `utf-8` do not, and keep using `iconv-lite`. Second, the byte-to-character
// table we derive is verified against `iconv-lite` itself for every possible
// byte value, so a change to `iconv-lite`'s internals degrades to the slow path
// rather than producing wrong output.
function buildDecoder(encoding: string): CharsetDecoder {
  let codec;
  try {
    codec = iconv.getCodec(encoding) as { decodeBuf?: unknown };
  } catch {
    // Unknown encoding. Defer to `iconv-lite` so it reports the error at the
    // point where a value is actually being decoded.
    return iconvDecoder(encoding);
  }

  if (!Buffer.isBuffer(codec.decodeBuf) || codec.decodeBuf.length !== 512) {
    return iconvDecoder(encoding);
  }

  const allBytes = Buffer.allocUnsafe(256);
  for (let i = 0; i < 256; i++) {
    allBytes[i] = i;
  }

  const chars = iconv.decode(allBytes, encoding);
  if (chars.length !== 256) {
    return iconvDecoder(encoding);
  }

  const singleByte = Buffer.allocUnsafe(1);
  const differing: number[] = [];

  for (let i = 0; i < 256; i++) {
    singleByte[0] = i;

    if (iconv.decode(singleByte, encoding) !== chars[i]) {
      return iconvDecoder(encoding);
    }

    if (chars.charCodeAt(i) !== i) {
      differing.push(i);
    }
  }

  if (differing.length === 0) {
    return (buf, start, end) => buf.toString('latin1', start, end);
  }

  const characterClass = '[' + differing.map((byte) => {
    return '\\u' + byte.toString(16).padStart(4, '0');
  }).join('') + ']';

  const containsDiffering = new RegExp(characterClass);
  const allDiffering = new RegExp(characterClass, 'g');
  const replace = (char: string) => chars[char.charCodeAt(0)];

  return (buf, start, end) => {
    const str = buf.toString('latin1', start, end);
    return containsDiffering.test(str) ? str.replace(allDiffering, replace) : str;
  };
}

export function getDecoder(encoding: string): CharsetDecoder {
  let decoder = decoders.get(encoding);

  if (decoder === undefined) {
    decoder = buildDecoder(encoding);
    decoders.set(encoding, decoder);
  }

  return decoder;
}

export function decodeChars(buf: Buffer, start: number, end: number, encoding: string): string {
  return getDecoder(encoding)(buf, start, end);
}
