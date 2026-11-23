import { isAscii, isUtf8 as isValidUtf8 } from 'buffer';
import { endianness } from 'os';

import { SINGLE_BYTE_HIGH_HALVES } from './codepage-tables';
import { ENCODING_OVERRIDES } from './codepage-encoding-overrides';

// Converts `char`, `varchar` and `text` values between JavaScript strings and
// the code page of their collation.
//
// Decoding:
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
// Encoding UTF-8 is left to Node.js. The legacy code pages are encoded with
// the inverse of the decoding tables, adjusted with the best-fit mappings and
// other choices SQL Server makes (see `codepage-encoding-overrides.ts`), so
// that a value is encoded exactly as SQL Server would convert it to `varchar`
// itself.

const REPLACEMENT_CHARACTER = 0xFFFD;
const QUESTION_MARK = 0x3F;

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

  // For a double-byte code page: what an invalid byte sequence decodes to.
  readonly defaultChar: number;
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

  // What Windows decodes an invalid byte sequence to, if not "?".
  readonly defaultChar?: number;
}

// The differences from `TextDecoder` were found by comparing it with
// Microsoft's tables for each code page (WindowsBestFit/bestfit<N>.txt at
// https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/); see
// `test/unit/text-encoding-test.ts`.
//
// As in Windows (and so in SQL Server), an invalid byte sequence decodes to
// the code page's default character: "?", or U+30FB (・) in CP932.
const DOUBLE_BYTE_CODEPAGES: { readonly [codepage: string]: DoubleByteCodepage } = {
  CP932: {
    label: 'shift_jis',
    defaultChar: 0x30FB,
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
      `Text in code page ${codepage} requires a Node.js build with full ICU support, ` +
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

  return { high, lead, pairs, singleBytes: undefined, defaultChar: spec.defaultChar ?? QUESTION_MARK };
}

function buildSingleByteTable(highHalf: string): CodepageTable {
  const high = new Uint16Array(128);
  const singleBytes = new Uint16Array(256);
  for (let i = 0; i < 128; i++) {
    high[i] = highHalf.charCodeAt(i);
    singleBytes[i] = i;
    singleBytes[0x80 + i] = high[i];
  }
  return { high, lead: undefined, pairs: undefined, singleBytes, defaultChar: QUESTION_MARK };
}

const tables = new Map<string, CodepageTable>();

/**
 * Forgets the decoding and encoding tables built so far. Only for tests.
 *
 * @private
 */
export function resetTables() {
  tables.clear();
  encodingTables.clear();
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

    const { high, lead, pairs, singleBytes, defaultChar } = this.table;

    if (singleBytes !== undefined) {
      return decodeSingleByte(buf, singleBytes);
    }

    // Every byte decodes to at most one UTF-16 code unit, but a lead byte left
    // over from the last part can add a character.
    const [out, units] = allocateUnits(buf.length + 1);
    let length = 0;

    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];
      let char;

      if (pending !== -1) {
        char = pairs![((pending - 0x80) << 8) | byte];
        pending = -1;

        if (char === 0) {
          // As in Windows, an invalid sequence of a lead byte and any byte
          // but 0x00 decodes to the default character as a whole. A 0x00
          // byte is a character on its own.
          units[length++] = defaultChar;

          if (byte !== 0x00) {
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
        char = high[byte - 0x80] || defaultChar;
      }

      units[length++] = char;
    }

    this.pending = pending;
    return unitsToString(out, length);
  }

  end(): string {
    // A lead byte at the end of a value (which SQL Server itself never
    // stores) decodes to the default character, as any invalid sequence.
    if (this.pending !== -1) {
      this.pending = -1;
      return String.fromCharCode(this.table.defaultChar);
    }
    return '';
  }
}

// The lead bytes of UTF-8 sequences whose second byte has a narrower range
// than 0x80 to 0xBF, and that range. With any other continuation byte (an
// overlong form, a surrogate, or a code point above U+10FFFF), the WHATWG
// decoder decodes the lead byte and the continuation byte to a replacement
// character each, but Windows (and so SQL Server) decodes the two to one.
const RESTRICTED_LEADS: ReadonlyArray<readonly [lead: number, first: number, last: number]> = [
  [0xE0, 0xA0, 0xBF], [0xED, 0x80, 0x9F], [0xF0, 0x90, 0xBF], [0xF4, 0x80, 0x8F]
];

// Replaces each such lead and continuation byte with a single 0xFF byte, which
// is never valid and so decodes to one replacement character, so that the
// WHATWG decoder decodes invalid UTF-8 as Windows does. Valid UTF-8 is
// returned as is.
function withWindowsErrors(buf: Buffer): Buffer {
  if (isValidUtf8(buf)) {
    return buf;
  }

  // A part of a streamed value is usually valid but for a character split at
  // its start or end. Then only the split character at the end can have such
  // a lead byte.
  let start = 0;
  while (start < 3 && start < buf.length && (buf[start] & 0xC0) === 0x80) {
    start++;
  }
  let end = buf.length;
  while (end > start && buf.length - end < 3 && (buf[end - 1] & 0xC0) === 0x80) {
    end--;
  }
  if (end > start && buf[end - 1] >= 0xC0) {
    end--;
  }
  if (isValidUtf8(buf.subarray(start, end)) && !hasRestrictedLead(buf, end)) {
    return buf;
  }

  let invalid: number[] | undefined;
  for (const [leadByte, first, last] of RESTRICTED_LEADS) {
    for (let i = buf.indexOf(leadByte); i !== -1 && i < buf.length - 1; i = buf.indexOf(leadByte, i + 1)) {
      const next = buf[i + 1];
      if (next >= 0x80 && next <= 0xBF && (next < first || next > last)) {
        (invalid ??= []).push(i);
      }
    }
  }

  if (invalid === undefined) {
    return buf;
  }

  invalid.sort((a, b) => a - b);
  const out = Buffer.allocUnsafe(buf.length - invalid.length);
  let from = 0;
  let length = 0;
  for (const i of invalid) {
    length += buf.copy(out, length, from, i);
    out[length++] = 0xFF;
    from = i + 2;
  }
  length += buf.copy(out, length, from);
  return out.subarray(0, length);
}

// Whether a restricted lead byte from `from` on is followed by a continuation
// byte out of its range.
function hasRestrictedLead(buf: Buffer, from: number) {
  for (let i = from; i < buf.length - 1; i++) {
    for (const [leadByte, first, last] of RESTRICTED_LEADS) {
      const next = buf[i + 1];
      if (buf[i] === leadByte && next >= 0x80 && next <= 0xBF && (next < first || next > last)) {
        return true;
      }
    }
  }
  return false;
}

function isRestrictedLead(byte: number) {
  return byte === 0xE0 || byte === 0xED || byte === 0xF0 || byte === 0xF4;
}

class Utf8Decoder implements StreamDecoder {
  declare decoder: TextDecoder;

  // A lead byte from the end of the last part whose continuation byte is
  // needed to tell how an invalid sequence decodes (see `withWindowsErrors`),
  // or undefined.
  declare pending: Buffer | undefined;

  constructor() {
    // A byte order mark is part of the value, as it is in an `nvarchar` value.
    this.decoder = new TextDecoder('utf-8', { ignoreBOM: true });
    this.pending = undefined;
  }

  write(buf: Buffer): string {
    if (this.pending !== undefined) {
      buf = Buffer.concat([this.pending, buf]);
      this.pending = undefined;
    }

    if (buf.length > 0 && isRestrictedLead(buf[buf.length - 1])) {
      this.pending = buf.subarray(buf.length - 1);
      buf = buf.subarray(0, buf.length - 1);
    }

    return this.decoder.decode(withWindowsErrors(buf), { stream: true });
  }

  end(): string {
    const pending = this.pending;
    this.pending = undefined;
    return (pending !== undefined ? this.decoder.decode(pending, { stream: true }) : '') + this.decoder.decode();
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
    return withWindowsErrors(buf).toString('utf8');
  }

  if (isAscii(buf)) {
    return buf.toString('latin1');
  }

  const decoder = new TableDecoder(tableFor(codepage!));
  return decoder.write(buf) + decoder.end();
}

// --- Encoding ----------------------------------------------------------------


/**
 * How every UTF-16 code unit is encoded in a legacy code page. As in SQL
 * Server, each code unit is encoded on its own: a character the code page does
 * not have, and any surrogate (so a character outside of the Basic
 * Multilingual Plane is two), is encoded as "?".
 */
interface EncodingTable {
  // For a single-byte code page: the byte for each code unit.
  readonly bytes: Uint8Array | undefined;

  // For a double-byte code page: the byte (below 0x100) or the two bytes (lead
  // byte first) for each code unit.
  readonly codes: Uint16Array | undefined;
}

// Applies the entries of `ENCODING_OVERRIDES` for a code page.
function applyOverrides(overrides: string, set: (char: number, code: number) => void) {
  for (const entry of overrides.split(' ')) {
    const match = /^([0-9A-F]{4})(?:-([0-9A-F]{4}))?:([0-9A-F]{2,4})(\+?)$/.exec(entry);
    if (match === null) {
      throw new Error(`Invalid encoding override: ${entry}.`);
    }

    const first = parseInt(match[1], 16);
    const last = match[2] === undefined ? first : parseInt(match[2], 16);
    const code = parseInt(match[3], 16);
    const step = match[4] === '+' ? 1 : 0;
    for (let char = first; char <= last; char++) {
      set(char, code + (char - first) * step);
    }
  }
}

function buildEncodingTable(codepage: string): EncodingTable {
  const { high, lead, pairs, singleBytes } = tableFor(codepage);
  const overrides = ENCODING_OVERRIDES[codepage];

  // Every character is encoded as the first byte sequence that decodes to it
  // (single bytes first, then two-byte sequences in order), unless SQL Server
  // encodes it otherwise.
  if (singleBytes !== undefined) {
    const bytes = new Uint8Array(0x10000).fill(QUESTION_MARK);
    const mapped = new Uint8Array(0x10000);
    for (let byte = 0; byte <= 0xFF; byte++) {
      const char = singleBytes[byte];
      if (!mapped[char]) {
        bytes[char] = byte;
        mapped[char] = 1;
      }
    }
    applyOverrides(overrides, (char, code) => {
      bytes[char] = code;
    });
    return { bytes, codes: undefined };
  }

  const codes = new Uint16Array(0x10000).fill(QUESTION_MARK);
  const mapped = new Uint8Array(0x10000);
  const add = (char: number, code: number) => {
    if (char !== 0 && !mapped[char]) {
      codes[char] = code;
      mapped[char] = 1;
    }
  };

  for (let byte = 0; byte < 0x80; byte++) {
    codes[byte] = byte;
    mapped[byte] = 1;
  }
  for (let byte = 0x80; byte <= 0xFF; byte++) {
    add(high[byte - 0x80], byte);
  }
  for (let leadByte = 0x80; leadByte <= 0xFF; leadByte++) {
    if (lead![leadByte]) {
      for (let trail = 0x40; trail <= 0xFE; trail++) {
        add(pairs![((leadByte - 0x80) << 8) | trail], (leadByte << 8) | trail);
      }
    }
  }
  applyOverrides(overrides, (char, code) => {
    codes[char] = code;
  });
  return { bytes: undefined, codes };
}

const encodingTables = new Map<string, EncodingTable>();

function encodingTableFor(codepage: string): EncodingTable {
  let table = encodingTables.get(codepage);
  if (table === undefined) {
    table = buildEncodingTable(codepage);
    encodingTables.set(codepage, table);
  }
  return table;
}

// The UTF-16 code units of a string. Reading them from a buffer is much faster
// than calling `charCodeAt` for each.
function codeUnits(value: string): Uint16Array {
  let buf = Buffer.from(value, 'utf16le');
  if (buf.byteOffset % 2 !== 0) {
    buf = Buffer.from(buf);
  }
  if (!LITTLE_ENDIAN) {
    buf.swap16();
  }
  return new Uint16Array(buf.buffer, buf.byteOffset, value.length);
}

function encodeWithTable(value: string, table: EncodingTable): Buffer {
  const { bytes, codes } = table;
  const units = codeUnits(value);

  if (bytes !== undefined) {
    const out = Buffer.allocUnsafe(units.length);
    for (let i = 0; i < units.length; i++) {
      out[i] = bytes[units[i]];
    }
    return out;
  }

  const out = Buffer.allocUnsafe(units.length * 2);
  let length = 0;
  for (let i = 0; i < units.length; i++) {
    const code = codes![units[i]];
    if (code > 0xFF) {
      out[length++] = code >> 8;
    }
    out[length++] = code & 0xFF;
  }
  return out.subarray(0, length);
}

/**
 * Encodes a value in the given code page, as SQL Server converts an
 * `nvarchar` value to `varchar` in a collation with this code page: a
 * character the code page does not have is encoded as a similar one (a
 * "best fit") where Windows defines one, and otherwise as "?".
 *
 * @param codepage A collation's code page, such as `CP1252` or `utf-8`.
 */
export function encode(value: string, codepage: string): Buffer {
  if (isUtf8(codepage)) {
    return Buffer.from(value, 'utf8');
  }

  // All the legacy code pages are ASCII compatible.
  if (isAsciiString(value)) {
    return Buffer.from(value, 'latin1');
  }

  return encodeWithTable(value, encodingTableFor(codepage));
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

  constructor(codepage: string) {
    this.codepage = codepage;
  }

  // Every UTF-16 code unit is encoded on its own, so nothing (such as half a
  // surrogate pair) carries over from one chunk to the next.
  write(chunk: string): Buffer {
    return encode(chunk, this.codepage);
  }

  end(): Buffer | undefined {
    return undefined;
  }
}

/**
 * Creates an encoder for a value in the given code page that is written in
 * parts. Each part is encoded as `encode` does.
 *
 * @param codepage A collation's code page, such as `CP1252` or `utf-8`.
 */
export function createEncoder(codepage: string): StreamEncoder {
  if (isUtf8(codepage)) {
    return new Utf8Encoder();
  }

  // Fail now, rather than on the first non-ASCII chunk, if the code page is
  // not supported.
  encodingTableFor(codepage);
  return new LegacyEncoder(codepage);
}
