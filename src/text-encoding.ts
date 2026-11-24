import { isAscii, isUtf8 } from 'buffer';
import { endianness } from 'os';

import { type Encoding } from './collation';
import { DOUBLE_BYTE_TABLES, SINGLE_BYTE_HIGH_HALVES, type DoubleByteTable } from './codepage-tables';
import { ENCODING_OVERRIDES } from './codepage-encoding-overrides';
import { SQL_SERVER_ENCODINGS } from './codepage-sqlserver-encodings';

// Converts `char`, `varchar` and `text` values between JavaScript strings and
// the code page of their collation.
//
// Decoding:
//
// - UTF-8 is decoded with Node.js' built-in UTF-8 decoder.
// - The legacy code pages (CP437, CP850, CP874, CP1250 to CP1258, and the
//   double-byte CP932, CP936, CP949 and CP950) are decoded with the tables in
//   `codepage-tables.ts`, Microsoft's tables for these code pages, which SQL
//   Server also uses to convert `varchar` to `nvarchar`. As in Windows, an
//   invalid byte sequence decodes to the code page's default character: "?",
//   or U+30FB (・) in CP932.
//
// Encoding UTF-8 is left to Node.js. The legacy code pages are encoded with
// the inverse of the decoding tables, adjusted with the best-fit mappings and
// other choices Windows and SQL Server make (see
// `codepage-encoding-overrides.ts` and `codepage-sqlserver-encodings.ts`), so
// that a value is encoded as SQL Server converts it to `varchar` itself (on
// Linux and on current versions of Windows; see
// `codepage-sqlserver-encodings.ts`).

const QUESTION_MARK = 0x3F;

/**
 * An encoder for a value that is written in several parts, such as a streamed
 * `varchar(max)` parameter. A UTF-16 surrogate pair split across parts is
 * encoded as a whole.
 */
export interface StreamEncoder {
  write(chunk: string): Buffer;
  end(): Buffer | undefined;
}

function isUtf8Codepage(codepage: Encoding | undefined): codepage is 'utf-8' | undefined {
  return codepage === undefined || codepage === 'utf-8';
}

function isSupported(codepage: Encoding) {
  return Object.hasOwn(SINGLE_BYTE_HIGH_HALVES, codepage) || Object.hasOwn(DOUBLE_BYTE_TABLES, codepage);
}

function assertSupported(codepage: Encoding) {
  if (!isSupported(codepage)) {
    throw new Error(`Unsupported code page: ${codepage}.`);
  }
}

const NON_ASCII = /[\u0080-\uFFFF]/;

function isAsciiString(value: string) {
  return !NON_ASCII.test(value);
}

const LITTLE_ENDIAN = endianness() === 'LE';

/**
 * How a single-byte code page is decoded.
 */
interface SingleByteCodepageTable {
  readonly doubleByte: false;

  // The UTF-16 code unit for every byte.
  readonly singleBytes: Uint16Array;
}

/**
 * How a double-byte code page is decoded.
 */
interface DoubleByteCodepageTable {
  readonly doubleByte: true;

  // The UTF-16 code unit for each single byte from 0x80 to 0xFF that is not a
  // lead byte, or 0 if the byte is not a character on its own.
  readonly high: Uint16Array;

  // 1 for each byte that starts a two-byte sequence.
  readonly lead: Uint8Array;

  // The UTF-16 code unit for each two-byte sequence, at
  // `(lead - 0x80) << 8 | trail`, or 0 if the sequence is not a character.
  readonly pairs: Uint16Array;

  // What an invalid byte sequence decodes to.
  readonly defaultChar: number;
}

type CodepageTable = SingleByteCodepageTable | DoubleByteCodepageTable;

function buildDoubleByteTable(spec: DoubleByteTable): DoubleByteCodepageTable {
  const lead = new Uint8Array(256);
  const leads = [];
  for (const [first, last] of spec.leadBytes) {
    lead.fill(1, first, last + 1);
    for (let byte = first; byte <= last; byte++) {
      leads.push(byte);
    }
  }

  // See `DOUBLE_BYTE_TABLES` for the layout of the data.
  const data = Buffer.from(spec.data, 'base64');
  const high = new Uint16Array(128);
  for (let i = 0; i < 128; i++) {
    high[i] = data.readUInt16LE(i * 2);
  }

  const pairs = new Uint16Array(0x8000);
  let offset = 256;
  for (const leadByte of leads) {
    const row = (leadByte - 0x80) << 8;
    for (let trail = 0x40; trail <= 0xFE; trail++) {
      pairs[row | trail] = data.readUInt16LE(offset);
      offset += 2;
    }
  }

  return { doubleByte: true, high, lead, pairs, defaultChar: spec.defaultChar };
}

function buildSingleByteTable(highHalf: string): SingleByteCodepageTable {
  const singleBytes = new Uint16Array(256);
  for (let i = 0; i < 128; i++) {
    singleBytes[i] = i;
    singleBytes[0x80 + i] = highHalf.charCodeAt(i);
  }
  return { doubleByte: false, singleBytes };
}

const tables = new Map<Encoding, CodepageTable>();

function tableFor(codepage: Encoding): CodepageTable {
  let table = tables.get(codepage);
  if (table === undefined) {
    assertSupported(codepage);
    table = Object.hasOwn(SINGLE_BYTE_HIGH_HALVES, codepage) ?
      buildSingleByteTable(SINGLE_BYTE_HIGH_HALVES[codepage]) :
      buildDoubleByteTable(DOUBLE_BYTE_TABLES[codepage]);
    tables.set(codepage, table);
  }
  return table;
}

// Allocates a buffer for `count` UTF-16 code units and a `Uint16Array` view of
// it. (Node.js aligns the buffers it allocates from its pool to 8 bytes, so the
// view's offset is always even.)
function allocateUnits(count: number): [Buffer, Uint16Array] {
  const out = Buffer.allocUnsafe(count * 2);
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

// Decodes a value in a double-byte code page.
function decodeDoubleByte(buf: Buffer, table: DoubleByteCodepageTable): string {
  const { high, lead, pairs, defaultChar } = table;

  // Every byte decodes to at most one UTF-16 code unit.
  const [out, units] = allocateUnits(buf.length);
  let length = 0;

  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];

    if (byte < 0x80) {
      units[length++] = byte;
    } else if (lead[byte] === 0) {
      units[length++] = high[byte - 0x80] || defaultChar;
    } else if (i + 1 === buf.length) {
      // A lead byte at the end of a value (which SQL Server itself never
      // stores) decodes to the default character, as any invalid sequence.
      units[length++] = defaultChar;
    } else {
      const trail = buf[++i];
      const char = pairs[((byte - 0x80) << 8) | trail];
      if (char !== 0) {
        units[length++] = char;
      } else {
        // As in Windows, an invalid sequence of a lead byte and any byte but
        // 0x00 decodes to the default character as a whole. A 0x00 byte is a
        // character on its own.
        units[length++] = defaultChar;
        if (trail === 0x00) {
          units[length++] = 0x00;
        }
      }
    }
  }

  return unitsToString(out, length);
}

// A lead byte of a UTF-8 sequence followed by a continuation byte outside of
// the range that lead byte allows: an overlong form, a surrogate, or a code
// point above U+10FFFF. The WHATWG decoder decodes such a pair to a
// replacement character each, but Windows (and so SQL Server) decodes the two
// to one. (As `latin1` text, so that a regular expression can match bytes.)
const RESTRICTED_LEAD_ERRORS = /\xE0[\x80-\x9F]|\xED[\xA0-\xBF]|\xF0[\x80-\x8F]|\xF4[\x90-\xBF]/g;

function decodeUtf8(buf: Buffer): string {
  if (!isUtf8(buf)) {
    // Replace each such pair with a single 0xFF byte, which is never valid
    // and so decodes to one replacement character.
    buf = Buffer.from(buf.toString('latin1').replace(RESTRICTED_LEAD_ERRORS, '\xFF'), 'latin1');
  }

  // Unlike `TextDecoder`, `toString` keeps a byte order mark, which is part of
  // the value, as it is in an `nvarchar` value.
  return buf.toString('utf8');
}

/**
 * Decodes a value in the given code page.
 *
 * @param codepage A collation's code page, such as `CP1252` or `utf-8`.
 *   Defaults to UTF-8.
 */
export function decode(buf: Buffer, codepage: Encoding | undefined): string {
  if (isUtf8Codepage(codepage)) {
    return decodeUtf8(buf);
  }

  assertSupported(codepage);
  if (isAscii(buf)) {
    return buf.toString('latin1');
  }

  const table = tableFor(codepage);
  return table.doubleByte ? decodeDoubleByte(buf, table) : decodeSingleByte(buf, table.singleBytes);
}

/**
 * How every UTF-16 code unit is encoded in a legacy code page: as the byte
 * (below 0x100) or the two bytes (lead byte first) at its index. As in SQL
 * Server, each code unit is encoded on its own: a character the code page does
 * not have, and any surrogate (so a character outside of the Basic
 * Multilingual Plane is two), is encoded as "?".
 */
interface EncodingTable {
  readonly doubleByte: boolean;
  readonly codes: Uint16Array;
}

// Applies the entries of the given overrides for a code page.
function applyOverrides(entries: string, codes: Uint16Array) {
  for (const entry of entries.split(' ')) {
    const match = /^([0-9A-F]{4})(?:-([0-9A-F]{4}))?:([0-9A-F]{2,4})(\+?)$/.exec(entry);
    if (match === null) {
      throw new Error(`Invalid encoding override: ${entry}.`);
    }

    const first = parseInt(match[1], 16);
    const last = match[2] === undefined ? first : parseInt(match[2], 16);
    const code = parseInt(match[3], 16);
    const step = match[4] === '+' ? 1 : 0;
    for (let char = first; char <= last; char++) {
      codes[char] = code + (char - first) * step;
    }
  }
}

/**
 * Builds the table to encode a legacy code page with.
 *
 * @param withSqlServerEncodings Whether to apply `SQL_SERVER_ENCODINGS`.
 *   `npm run record:codepages` builds the table without them, to record them.
 * @private
 */
export function buildEncodingTable(codepage: Encoding, withSqlServerEncodings = true): EncodingTable {
  const table = tableFor(codepage);

  // Every character is encoded as the first byte sequence that decodes to it
  // (single bytes first, then two-byte sequences in order), unless Windows or
  // SQL Server encodes it otherwise.
  const codes = new Uint16Array(0x10000).fill(QUESTION_MARK);
  const mapped = new Uint8Array(0x10000);
  const add = (char: number, code: number) => {
    if (!mapped[char]) {
      codes[char] = code;
      mapped[char] = 1;
    }
  };

  for (let byte = 0; byte < 0x80; byte++) {
    add(byte, byte);
  }

  if (!table.doubleByte) {
    for (let byte = 0x80; byte <= 0xFF; byte++) {
      add(table.singleBytes[byte], byte);
    }
  } else {
    // 0 marks a byte or a two-byte sequence that is not a character.
    const { high, lead, pairs } = table;
    for (let byte = 0x80; byte <= 0xFF; byte++) {
      if (high[byte - 0x80] !== 0) {
        add(high[byte - 0x80], byte);
      }
    }
    for (let leadByte = 0x80; leadByte <= 0xFF; leadByte++) {
      if (lead[leadByte]) {
        for (let trail = 0x40; trail <= 0xFE; trail++) {
          const char = pairs[((leadByte - 0x80) << 8) | trail];
          if (char !== 0) {
            add(char, (leadByte << 8) | trail);
          }
        }
      }
    }
  }

  if (Object.hasOwn(ENCODING_OVERRIDES, codepage)) {
    applyOverrides(ENCODING_OVERRIDES[codepage], codes);
  }
  if (withSqlServerEncodings && Object.hasOwn(SQL_SERVER_ENCODINGS, codepage)) {
    applyOverrides(SQL_SERVER_ENCODINGS[codepage], codes);
  }

  return { doubleByte: table.doubleByte, codes };
}

const encodingTables = new Map<Encoding, EncodingTable>();

function encodingTableFor(codepage: Encoding): EncodingTable {
  let table = encodingTables.get(codepage);
  if (table === undefined) {
    table = buildEncodingTable(codepage);
    encodingTables.set(codepage, table);
  }
  return table;
}

// The UTF-16 code units of a string. Reading them from a buffer is much faster
// than calling `charCodeAt` for each. (As in `allocateUnits`, the buffer's
// offset is always even.)
function codeUnits(value: string): Uint16Array {
  const buf = Buffer.from(value, 'utf16le');
  if (!LITTLE_ENDIAN) {
    buf.swap16();
  }
  return new Uint16Array(buf.buffer, buf.byteOffset, value.length);
}

function encodeWithTable(value: string, { doubleByte, codes }: EncodingTable): Buffer {
  const units = codeUnits(value);

  if (!doubleByte) {
    const out = Buffer.allocUnsafe(units.length);
    for (let i = 0; i < units.length; i++) {
      out[i] = codes[units[i]];
    }
    return out;
  }

  const out = Buffer.allocUnsafe(units.length * 2);
  let length = 0;
  for (let i = 0; i < units.length; i++) {
    const code = codes[units[i]];
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
 * "best fit") where Windows defines one, and otherwise as "?". Each UTF-16
 * code unit is encoded on its own, so a character outside of the Basic
 * Multilingual Plane is encoded as "??".
 *
 * @param codepage A collation's code page, such as `CP1252` or `utf-8`.
 */
export function encode(value: string, codepage: Encoding): Buffer {
  if (isUtf8Codepage(codepage)) {
    return Buffer.from(value, 'utf8');
  }

  assertSupported(codepage);

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
  declare readonly codepage: Encoding;

  constructor(codepage: Encoding) {
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
export function createEncoder(codepage: Encoding): StreamEncoder {
  if (isUtf8Codepage(codepage)) {
    return new Utf8Encoder();
  }

  assertSupported(codepage);
  return new LegacyEncoder(codepage);
}
