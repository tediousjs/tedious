import { isAscii } from 'buffer';
import { endianness } from 'os';

import { SINGLE_BYTE_HIGH_HALVES } from './codepage-tables';
import { loadIconv } from './iconv';

// Converts `char`, `varchar` and `text` values between JavaScript strings and
// the code page of their collation.
//
// Decoding never needs `iconv-lite`:
//
// - UTF-8 is decoded with Node.js' built-in UTF-8 decoder.
// - The single-byte code pages (CP437, CP850, CP874 and CP1250 to CP1258) are
//   decoded with the tables in `codepage-tables.ts`, which are Windows' own
//   (as are the ones SQL Server uses to convert `varchar` to `nvarchar`).
// - The double-byte code pages (CP932, CP936, CP949 and CP950) are decoded
//   with tables built on first use from Node.js' `TextDecoder`, with the
//   corrections listed in `DOUBLE_BYTE_CODEPAGES` where `TextDecoder` does not
//   decode a byte sequence as Windows does.
//
// Encoding needs `iconv-lite` only for non-ASCII text in a legacy code page:
// UTF-8 is encoded by Node.js, and all the legacy code pages are ASCII
// compatible.

const REPLACEMENT_CHARACTER = 0xFFFD;

/**
 * A decoder for a value that arrives in several parts, such as a `varchar(max)`
 * value. Characters split across parts are decoded as a whole.
 */
export interface StreamDecoder {
  write(buf: Buffer): string;
  end(): string;
}

/**
 * An encoder for a value that is written in several parts, such as a streamed
 * `varchar(max)` parameter. A UTF-16 surrogate pair split across parts is
 * encoded as a whole.
 */
export interface StreamEncoder {
  write(chunk: string): Buffer;
  end(): Buffer | undefined;
}

function isUtf8(codepage: string | undefined) {
  return codepage === undefined || codepage === 'utf-8' || codepage === 'utf8';
}

const NON_ASCII = /[\u0080-\uFFFF]/;

function isAsciiString(value: string) {
  return !NON_ASCII.test(value);
}

const LITTLE_ENDIAN = endianness() === 'LE';

// --- Decoding ----------------------------------------------------------------

/**
 * How the bytes 0x80 to 0xFF of a legacy code page are decoded.
 */
interface CodepageTable {
  // The UTF-16 code unit for each single byte from 0x80 to 0xFF that is not a
  // lead byte, or 0 if the byte is not a character on its own.
  readonly high: Uint16Array;

  // For a double-byte code page: 1 for each byte that starts a two-byte
  // sequence.
  readonly lead: Uint8Array | undefined;

  // For a double-byte code page: the UTF-16 code unit for each two-byte
  // sequence, at `(lead - 0x80) << 8 | trail`, or 0 if the sequence is not a
  // character.
  readonly pairs: Uint16Array | undefined;

  // For a single-byte code page: the UTF-16 code unit for every byte.
  readonly singleBytes: Uint16Array | undefined;
}

interface DoubleByteCodepage {
  // The WHATWG encoding label `TextDecoder` decodes this code page as.
  readonly label: string;

  // The ranges of lead bytes, as Windows defines them.
  readonly leadBytes: ReadonlyArray<readonly [number, number]>;

  // Single bytes `TextDecoder` does not decode as Windows does.
  readonly singleByteCorrections?: ReadonlyArray<readonly [byte: number, char: number]>;

  // Runs of two-byte sequences `TextDecoder` does not decode as Windows does:
  // `count` consecutive sequences from `sequence` decode to consecutive
  // characters from `char`.
  readonly doubleByteCorrections?: ReadonlyArray<readonly [sequence: number, char: number, count: number]>;

  // Whether to add the Unified Hangul Code extension (see `addUhcExtension`).
  readonly uhc?: boolean;
}

// The differences from `TextDecoder` were found by comparing it with
// Microsoft's tables for each code page (WindowsBestFit/bestfit<N>.txt at
// https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/); see
// `test/unit/text-encoding-test.ts`. Windows also maps a handful of undefined
// sequences to a default character (such as 0x8540 in CP932 to U+30FB);
// those are decoded as U+FFFD instead, like any other invalid sequence.
const DOUBLE_BYTE_CODEPAGES: { readonly [codepage: string]: DoubleByteCodepage } = {
  CP932: {
    label: 'shift_jis',
    leadBytes: [[0x81, 0x9F], [0xE0, 0xFC]],
    // Windows maps these bytes to U+0080 and to private use characters, where
    // the WHATWG Shift_JIS decoder treats them as errors.
    singleByteCorrections: [[0x80, 0x0080], [0xA0, 0xF8F0], [0xFD, 0xF8F1], [0xFE, 0xF8F2], [0xFF, 0xF8F3]]
  },
  CP936: {
    label: 'gbk',
    leadBytes: [[0x81, 0xFE]],
    singleByteCorrections: [[0xFF, 0xF8F5]],
    // `TextDecoder` decodes GBK as GB18030-2005, which maps these sequences to
    // characters that were added to Unicode later. Windows' CP936 maps them to
    // the private use characters they were assigned before.
    doubleByteCorrections: [
      [0xA2E3, 0xE76C, 1], [0xA3A0, 0xE5E5, 1], [0xA6D9, 0xE78D, 7], [0xA6EC, 0xE794, 2],
      [0xA6F3, 0xE796, 1], [0xA8BC, 0xE7C7, 1], [0xA8BF, 0xE7C8, 1], [0xA989, 0xE7E7, 13],
      [0xFE50, 0xE815, 1], [0xFE54, 0xE819, 24], [0xFE6D, 0xE832, 9], [0xFE77, 0xE83C, 8],
      [0xFE80, 0xE844, 17], [0xFE92, 0xE856, 15]
    ]
  },
  CP949: {
    label: 'euc-kr',
    leadBytes: [[0x81, 0xFE]],
    singleByteCorrections: [[0x80, 0x0080], [0xFF, 0xF8F7]],
    // The euro sign and the registered sign were added to CP949 later.
    doubleByteCorrections: [[0xA2E6, 0x20AC, 1], [0xA2E7, 0x00AE, 1]],
    uhc: true
  },
  CP950: {
    label: 'big5',
    leadBytes: [[0x81, 0xFE]]
  }
};

function createTextDecoder(codepage: string, label: string) {
  try {
    return new TextDecoder(label);
  } catch (error) {
    throw new Error(
      `Decoding text in code page ${codepage} requires a Node.js build with full ICU support, ` +
      `but its TextDecoder does not support the '${label}' encoding.`,
      { cause: error }
    );
  }
}

// CP949 is EUC-KR extended with the Unified Hangul Code (UHC): the 8,822 modern
// Hangul syllables that are not in KS X 1001 are added in Unicode order, in the
// two-byte sequences that EUC-KR leaves unused. Node.js' `TextDecoder` only
// decodes EUC-KR itself, so the extension is added here.
function addUhcExtension(pairs: Uint16Array) {
  // The syllables KS X 1001 has, in rows 0xB0 to 0xC8.
  const inKsX1001 = new Set<number>();
  for (let lead = 0xB0; lead <= 0xC8; lead++) {
    for (let trail = 0xA1; trail <= 0xFE; trail++) {
      inKsX1001.add(pairs[((lead - 0x80) << 8) | trail]);
    }
  }

  let syllable = 0xAC00;
  const nextSyllable = () => {
    while (inKsX1001.has(syllable)) {
      syllable++;
    }
    return syllable++;
  };

  for (let lead = 0x81; lead <= 0xC6; lead++) {
    // Up to lead byte 0xA0, the extension uses all trail bytes outside of the
    // EUC-KR range; after that, only those below 0xA1.
    const ranges = [[0x41, 0x5A], [0x61, 0x7A], [0x81, lead <= 0xA0 ? 0xFE : 0xA0]];
    for (const [first, last] of ranges) {
      for (let trail = first; trail <= last; trail++) {
        const char = nextSyllable();
        if (char > 0xD7A3) {
          return;
        }
        pairs[((lead - 0x80) << 8) | trail] = char;
      }
    }
  }
}

function buildDoubleByteTable(codepage: string, spec: DoubleByteCodepage): CodepageTable {
  const decoder = createTextDecoder(codepage, spec.label);

  const lead = new Uint8Array(256);
  for (const [first, last] of spec.leadBytes) {
    lead.fill(1, first, last + 1);
  }

  const high = new Uint16Array(128);
  for (let byte = 0x80; byte <= 0xFF; byte++) {
    if (!lead[byte]) {
      const char = decoder.decode(Buffer.of(byte));
      if (char.length === 1 && char.charCodeAt(0) !== REPLACEMENT_CHARACTER) {
        high[byte - 0x80] = char.charCodeAt(0);
      }
    }
  }

  // Decode every possible two-byte sequence at once, each followed by a line
  // feed (which is never part of a two-byte sequence) to tell them apart.
  const leads = [];
  for (let byte = 0x80; byte <= 0xFF; byte++) {
    if (lead[byte]) {
      leads.push(byte);
    }
  }

  const sequences = Buffer.alloc(leads.length * 0xBF * 3);
  let offset = 0;
  for (const leadByte of leads) {
    for (let trail = 0x40; trail <= 0xFE; trail++) {
      sequences[offset++] = leadByte;
      sequences[offset++] = trail;
      sequences[offset++] = 0x0A;
    }
  }

  const decoded = decoder.decode(sequences).split('\n');
  const pairs = new Uint16Array(0x8000);
  let index = 0;
  for (const leadByte of leads) {
    for (let trail = 0x40; trail <= 0xFE; trail++) {
      const char = decoded[index++];
      if (char.length === 1 && char.charCodeAt(0) !== REPLACEMENT_CHARACTER) {
        pairs[((leadByte - 0x80) << 8) | trail] = char.charCodeAt(0);
      }
    }
  }

  if (spec.uhc) {
    addUhcExtension(pairs);
  }

  for (const [byte, char] of spec.singleByteCorrections ?? []) {
    high[byte - 0x80] = char;
  }

  for (const [sequence, char, count] of spec.doubleByteCorrections ?? []) {
    for (let i = 0; i < count; i++) {
      pairs[sequence + i - 0x8000] = char + i;
    }
  }

  return { high, lead, pairs, singleBytes: undefined };
}

function buildSingleByteTable(highHalf: string): CodepageTable {
  const high = new Uint16Array(128);
  const singleBytes = new Uint16Array(256);
  for (let i = 0; i < 128; i++) {
    high[i] = highHalf.charCodeAt(i);
    singleBytes[i] = i;
    singleBytes[0x80 + i] = high[i];
  }
  return { high, lead: undefined, pairs: undefined, singleBytes };
}

const tables = new Map<string, CodepageTable>();

/**
 * Forgets the decoding tables built so far. Only for tests.
 *
 * @private
 */
export function resetDecodingTables() {
  tables.clear();
}

function tableFor(codepage: string): CodepageTable {
  let table = tables.get(codepage);
  if (table === undefined) {
    const highHalf = SINGLE_BYTE_HIGH_HALVES[codepage];
    const doubleByte = DOUBLE_BYTE_CODEPAGES[codepage];
    if (highHalf !== undefined) {
      table = buildSingleByteTable(highHalf);
    } else if (doubleByte !== undefined) {
      table = buildDoubleByteTable(codepage, doubleByte);
    } else {
      throw new Error(`Unsupported code page: ${codepage}.`);
    }
    tables.set(codepage, table);
  }
  return table;
}

// Allocates a buffer for `count` UTF-16 code units and a `Uint16Array` view of
// it. The view needs an even offset, which pooled buffers always have.
function allocateUnits(count: number): [Buffer, Uint16Array] {
  let out = Buffer.allocUnsafe(count * 2);
  if (out.byteOffset % 2 !== 0) {
    out = Buffer.allocUnsafeSlow(count * 2);
  }
  return [out, new Uint16Array(out.buffer, out.byteOffset, count)];
}

function unitsToString(out: Buffer, length: number): string {
  if (!LITTLE_ENDIAN) {
    out.subarray(0, length * 2).swap16();
  }
  return out.toString('utf16le', 0, length * 2);
}

// Decodes a value in a single-byte code page, where every byte is a character.
function decodeSingleByte(buf: Buffer, singleBytes: Uint16Array): string {
  const [out, units] = allocateUnits(buf.length);
  for (let i = 0; i < buf.length; i++) {
    units[i] = singleBytes[buf[i]];
  }
  return unitsToString(out, buf.length);
}

class TableDecoder implements StreamDecoder {
  declare table: CodepageTable;

  // A lead byte at the end of the last part, or -1.
  declare pending: number;

  constructor(table: CodepageTable) {
    this.table = table;
    this.pending = -1;
  }

  write(buf: Buffer): string {
    let pending = this.pending;
    if (pending === -1 && isAscii(buf)) {
      return buf.toString('latin1');
    }

    const { high, lead, pairs, singleBytes } = this.table;

    if (singleBytes !== undefined) {
      return decodeSingleByte(buf, singleBytes);
    }

    // Every byte decodes to at most one UTF-16 code unit, but a lead byte left
    // over from the last part can add a replacement character.
    const [out, units] = allocateUnits(buf.length + 1);
    let length = 0;

    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];
      let char;

      if (pending !== -1) {
        char = pairs![((pending - 0x80) << 8) | byte];
        pending = -1;

        if (char === 0) {
          // An invalid sequence decodes to a replacement character. As in the
          // WHATWG decoders, an ASCII byte after the lead byte is not part of
          // the sequence, but a character on its own.
          units[length++] = REPLACEMENT_CHARACTER;

          if (byte >= 0x80) {
            continue;
          }

          char = byte;
        }
      } else if (byte < 0x80) {
        char = byte;
      } else if (lead !== undefined && lead[byte] === 1) {
        pending = byte;
        continue;
      } else {
        char = high[byte - 0x80] || REPLACEMENT_CHARACTER;
      }

      units[length++] = char;
    }

    this.pending = pending;
    return unitsToString(out, length);
  }

  end(): string {
    if (this.pending !== -1) {
      this.pending = -1;
      return '�';
    }
    return '';
  }
}

class Utf8Decoder implements StreamDecoder {
  declare decoder: TextDecoder;

  constructor() {
    // A byte order mark is part of the value, as it is in an `nvarchar` value.
    this.decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  }

  write(buf: Buffer): string {
    return this.decoder.decode(buf, { stream: true });
  }

  end(): string {
    return this.decoder.decode();
  }
}

/**
 * Creates a decoder for a value in the given code page that arrives in parts.
 *
 * @param codepage A collation's code page, such as `CP1252` or `utf-8`.
 *   Defaults to UTF-8.
 */
export function createDecoder(codepage: string | undefined): StreamDecoder {
  if (isUtf8(codepage)) {
    return new Utf8Decoder();
  }
  return new TableDecoder(tableFor(codepage!));
}

/**
 * Decodes a value in the given code page.
 *
 * @param codepage A collation's code page, such as `CP1252` or `utf-8`.
 *   Defaults to UTF-8.
 */
export function decode(buf: Buffer, codepage: string | undefined): string {
  if (isUtf8(codepage)) {
    return buf.toString('utf8');
  }

  if (isAscii(buf)) {
    return buf.toString('latin1');
  }

  const decoder = new TableDecoder(tableFor(codepage!));
  return decoder.write(buf) + decoder.end();
}

// --- Encoding ----------------------------------------------------------------

/**
 * Encodes a value in the given code page.
 *
 * Non-ASCII text in a legacy (non-UTF-8) code page needs the optional
 * `iconv-lite` package; if it is not installed, this throws an error naming
 * the code page and the type.
 *
 * @param codepage A collation's code page, such as `CP1252` or `utf-8`.
 * @param typeName The name of the data type being encoded, for the error
 *   message if `iconv-lite` is needed but not installed.
 */
export function encode(value: string, codepage: string, typeName: string): Buffer {
  if (isUtf8(codepage)) {
    return Buffer.from(value, 'utf8');
  }

  // All the legacy code pages are ASCII compatible.
  if (isAsciiString(value)) {
    return Buffer.from(value, 'latin1');
  }

  return loadIconv(codepage, typeName).encode(value, codepage);
}

class Utf8Encoder implements StreamEncoder {
  // A high surrogate at the end of the last chunk, or ''.
  declare pending: string;

  constructor() {
    this.pending = '';
  }

  write(chunk: string): Buffer {
    let str = this.pending + chunk;
    this.pending = '';

    if (str.length > 0) {
      const last = str.charCodeAt(str.length - 1);
      if (last >= 0xD800 && last <= 0xDBFF) {
        this.pending = str[str.length - 1];
        str = str.slice(0, -1);
      }
    }

    return Buffer.from(str, 'utf8');
  }

  end(): Buffer | undefined {
    if (this.pending === '') {
      return undefined;
    }

    // An unpaired surrogate, encoded as `Buffer.from` encodes one.
    const pending = this.pending;
    this.pending = '';
    return Buffer.from(pending, 'utf8');
  }
}

class LegacyEncoder implements StreamEncoder {
  declare codepage: string;
  declare typeName: string;
  declare encoder: { write(str: string): Buffer, end(): Buffer | undefined } | undefined;

  constructor(codepage: string, typeName: string) {
    this.codepage = codepage;
    this.typeName = typeName;
    this.encoder = undefined;
  }

  write(chunk: string): Buffer {
    // Until a chunk has non-ASCII text, there is nothing (such as half a
    // surrogate pair) to carry over to the next chunk.
    if (this.encoder === undefined) {
      if (isAsciiString(chunk)) {
        return Buffer.from(chunk, 'latin1');
      }

      this.encoder = loadIconv(this.codepage, this.typeName).getEncoder(this.codepage);
    }

    return this.encoder.write(chunk);
  }

  end(): Buffer | undefined {
    return this.encoder?.end();
  }
}

/**
 * Creates an encoder for a value in the given code page that is written in
 * parts. As with `encode`, non-ASCII text in a legacy code page needs the
 * optional `iconv-lite` package.
 *
 * @param codepage A collation's code page, such as `CP1252` or `utf-8`.
 * @param typeName The name of the data type being encoded, for the error
 *   message if `iconv-lite` is needed but not installed.
 */
export function createEncoder(codepage: string, typeName: string): StreamEncoder {
  if (isUtf8(codepage)) {
    return new Utf8Encoder();
  }
  return new LegacyEncoder(codepage, typeName);
}
