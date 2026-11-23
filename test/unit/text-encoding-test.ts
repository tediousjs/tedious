import { assert } from 'chai';
import sinon from 'sinon';
import iconv from 'iconv-lite';

import { createDecoder, createEncoder, decode, encode, resetTables } from '../../src/text-encoding';
import { PLPReader } from '../../src/value-parser';
import { NotEnoughDataError } from '../../src/token/helpers';
import { type Metadata } from '../../src/metadata-parser';
import { Collation } from '../../src/collation';
import { typeByName as TYPES } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import Request from '../../src/request';
import { RequestError } from '../../src/errors';

const SINGLE_BYTE_CODEPAGES = ['CP437', 'CP850', 'CP874', 'CP1250', 'CP1251', 'CP1252', 'CP1253', 'CP1254', 'CP1255', 'CP1256', 'CP1257', 'CP1258'];
const DOUBLE_BYTE_CODEPAGES = ['CP932', 'CP936', 'CP949', 'CP950'];
const ALL_CODEPAGES = [...SINGLE_BYTE_CODEPAGES, ...DOUBLE_BYTE_CODEPAGES];

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;
const latin1Collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xd0, 0x00, 0x34]));
const utf8Collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0x00, 0x26, 0x00]));

function hex(text: string) {
  return Array.from(text, (c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

describe('text encoding', function() {
  describe('encoding', function() {
    it('encodes UTF-8 text with Node.js', function() {
      const value = 'héllo wörld \u{1F600} \uD83D';
      assert.deepEqual(encode(value, 'utf-8'), Buffer.from(value, 'utf8'));
    });

    for (const codepage of ALL_CODEPAGES) {
      it(`encodes ASCII text in ${codepage} as is`, function() {
        let value = '';
        for (let i = 0; i < 128; i++) {
          value += String.fromCharCode(i);
        }

        const encoded = encode(value, codepage);
        assert.deepEqual(encoded, Buffer.from(value, 'latin1'));
        assert.deepEqual(encoded, iconv.encode(value, codepage));
      });
    }

    it('encodes an empty string', function() {
      assert.deepEqual(encode('', 'CP1252'), Buffer.alloc(0));
      assert.deepEqual(encode('', 'CP932'), Buffer.alloc(0));
    });

    it('encodes the characters a code page has', function() {
      assert.deepEqual(encode('café', 'CP1252'), Buffer.from([0x63, 0x61, 0x66, 0xE9]));
      assert.deepEqual(encode('Ωμέγα', 'CP1253'), Buffer.from([0xD9, 0xEC, 0xDD, 0xE3, 0xE1]));
      assert.deepEqual(encode('╔═╗', 'CP437'), Buffer.from([0xC9, 0xCD, 0xBB]));
      assert.deepEqual(encode('a日本b', 'CP932'), Buffer.from([0x61, 0x93, 0xFA, 0x96, 0x7B, 0x62]));
      assert.deepEqual(encode('한똠', 'CP949'), Buffer.from([0xC7, 0xD1, 0x8C, 0x63]));
    });

    for (const codepage of ALL_CODEPAGES) {
      it(`encodes every character ${codepage} decodes to back to bytes that decode to it`, function() {
        const doubleByte = DOUBLE_BYTE_CODEPAGES.includes(codepage);
        const sequences = [];
        for (let byte = 0x80; byte <= 0xFF; byte++) {
          sequences.push(Buffer.of(byte));
          if (doubleByte) {
            for (let trail = 0x40; trail <= 0xFE; trail++) {
              sequences.push(Buffer.of(byte, trail));
            }
          }
        }

        let characters = 0;
        for (const bytes of sequences) {
          const char = decode(bytes, codepage);
          if (char.length !== 1 || char === '�') {
            continue;
          }

          characters++;
          assert.strictEqual(decode(encode(char, codepage), codepage), char, `${hex(char)} (${bytes.toString('hex')})`);
        }
        assert.isAbove(characters, 100);
      });
    }

    it('encodes a character the code page does not have as a similar one, as SQL Server does', function() {
      // Best-fit mappings from Windows' tables: Ā, full-width A, ∞.
      assert.deepEqual(encode('Āａ∞', 'CP1252'), Buffer.from('Aa8'));
      // One SQL Server adds: a punctuation space.
      assert.deepEqual(encode('a b', 'CP1252'), Buffer.from('a b'));
      // ◙ is a character of its own in CP437, but encoded as the control
      // character it shares the byte with.
      assert.deepEqual(encode('◙', 'CP437'), Buffer.of(0x0A));
      assert.deepEqual(encode('Ａ', 'CP932'), Buffer.of(0x82, 0x60));
    });

    it('encodes other characters the code page does not have as "?"', function() {
      assert.deepEqual(encode('a日b', 'CP1252'), Buffer.from('a?b'));
      assert.deepEqual(encode('�', 'CP1252'), Buffer.from('?'));
      assert.deepEqual(encode('ก', 'CP932'), Buffer.from('?'));
    });

    it('encodes each surrogate as "?", as SQL Server does', function() {
      for (const codepage of ALL_CODEPAGES) {
        assert.deepEqual(encode('a\u{1F600}b', codepage), Buffer.from('a??b'), codepage);
        assert.deepEqual(encode('a\uD83Db\uDE00', codepage), Buffer.from('a?b?'), codepage);
      }
    });

    it('encodes a character several sequences decode to as SQL Server does', function() {
      // As IBM's extension rather than NEC's selection of it.
      assert.deepEqual(encode('ⅰ', 'CP932'), Buffer.of(0xFA, 0x40));
      assert.strictEqual(decode(Buffer.of(0xEE, 0xEF), 'CP932'), 'ⅰ');

      assert.deepEqual(encode('\u5341\u2550', 'CP950'), Buffer.of(0xA4, 0x51, 0xF9, 0xF9));
      assert.strictEqual(decode(Buffer.of(0xA2, 0xCC, 0xA2, 0xA4), 'CP950'), '\u5341\u2550');
    });

    it('fails to encode non-ASCII text in an unsupported code page', function() {
      assert.deepEqual(encode('abc', 'CP1'), Buffer.from('abc'));
      assert.throws(() => encode('é', 'CP1'), Error, 'Unsupported code page: CP1.');
      assert.throws(() => createEncoder('CP1'), Error, 'Unsupported code page: CP1.');
    });

    it('encodes streamed UTF-8 text with Node.js, keeping split surrogate pairs together', function() {
      const encoder = createEncoder('utf-8');
      const chunks = [encoder.write('a\uD83D'), encoder.write(''), encoder.write('\uDE00b\uD83D'), encoder.end()];
      assert.deepEqual(Buffer.concat(chunks.filter((c) => c !== undefined)), Buffer.from('a\u{1F600}b\uD83D', 'utf8'));
    });

    it('encodes streamed text in a legacy code page as a whole value would be', function() {
      const value = 'ab日\u{1F600}本Ａ';
      for (let split = 0; split <= value.length; split++) {
        const encoder = createEncoder('CP932');
        const chunks = [encoder.write(value.slice(0, split)), encoder.write(''), encoder.write(value.slice(split)), encoder.end()];
        assert.deepEqual(Buffer.concat(chunks.filter((c) => c !== undefined)), encode(value, 'CP932'), `split at ${split}`);
      }
    });

    it('encodes a parameter in the collation\'s code page', function() {
      const request = new Request('select @p', () => {});
      request.addParameter('p', TYPES.VarChar, 'café Ā');
      request.addParameter('q', TYPES.Char, 'naïve');
      request.validateParameters(latin1Collation, options);

      assert.deepEqual(request.parameters[0].value, Buffer.from([0x63, 0x61, 0x66, 0xE9, 0x20, 0x41]));
      assert.deepEqual(request.parameters[1].value, Buffer.from([0x6E, 0x61, 0xEF, 0x76, 0x65]));
    });

    it('encodes a parameter in a UTF-8 collation as UTF-8', function() {
      const request = new Request('select @p', () => {});
      request.addParameter('p', TYPES.VarChar, 'café');
      request.validateParameters(utf8Collation, options);

      assert.deepEqual(request.parameters[0].value, Buffer.from('café', 'utf8'));
    });

    it('fails a parameter in an unsupported code page as an EPARAM request error', function() {
      const request = new Request('select @p', () => {});
      request.addParameter('p', TYPES.VarChar, 'café');

      const collation: Collation = Object.create(latin1Collation, { codepage: { value: 'CP1' } });

      try {
        request.validateParameters(collation, options);
      } catch (error: any) {
        assert.instanceOf(error, RequestError);
        assert.strictEqual(error.code, 'EPARAM');
        assert.include(error.message, 'Unsupported code page: CP1.');
        return;
      }
      assert.fail('expected an error');
    });
  });

  describe('decoding', function() {
    it('decodes UTF-8, keeping a byte order mark', function() {
      const value = '﻿héllo \u{1F600}';
      assert.strictEqual(decode(Buffer.from(value, 'utf8'), 'utf-8'), value);
      assert.strictEqual(decode(Buffer.from(value, 'utf8'), undefined), value);
    });

    it('decodes invalid UTF-8 to replacement characters', function() {
      assert.strictEqual(decode(Buffer.from([0x61, 0xC3, 0x62, 0xFF]), 'utf-8'), 'a�b�');
    });

    it('decodes ASCII in every code page as is', function() {
      const ascii = Buffer.alloc(128);
      for (let i = 0; i < 128; i++) {
        ascii[i] = i;
      }

      for (const codepage of ALL_CODEPAGES) {
        assert.strictEqual(decode(ascii, codepage), ascii.toString('latin1'), codepage);
      }
    });

    it('decodes CP437 and CP850 with the embedded tables', function() {
      assert.strictEqual(decode(Buffer.from([0xC9, 0xCD, 0xBB, 0x80, 0xE1, 0x9B]), 'CP437'), '╔═╗Çß¢');
      assert.strictEqual(decode(Buffer.from([0xC9, 0xCD, 0xBB, 0x80, 0xE1, 0x9B]), 'CP850'), '╔═╗Çßø');
      assert.strictEqual(decode(Buffer.from([0x48, 0x82, 0x6C, 0x8A, 0xFF]), 'CP437'), 'Hélè ');
    });

    it('decodes double-byte text', function() {
      assert.strictEqual(decode(encode('日本語 テキスト', 'CP932'), 'CP932'), '日本語 テキスト');
      assert.strictEqual(decode(encode('中文文本', 'CP936'), 'CP936'), '中文文本');
      assert.strictEqual(decode(encode('한국어 똠방각하', 'CP949'), 'CP949'), '한국어 똠방각하');
      assert.strictEqual(decode(encode('中文文本', 'CP950'), 'CP950'), '中文文本');
    });

    it('decodes a lead byte at the end of a value to a replacement character', function() {
      assert.strictEqual(decode(Buffer.from([0x61, 0x82]), 'CP932'), 'a�');
    });

    it('decodes an invalid sequence followed by an ASCII byte as a replacement character and that byte', function() {
      assert.strictEqual(decode(Buffer.from([0x82, 0x20, 0x61]), 'CP932'), '� a');
    });

    it('decodes characters split across the parts of a streamed value', function() {
      for (const codepage of [...DOUBLE_BYTE_CODEPAGES, 'utf-8']) {
        const value = { 'CP932': 'aあ日b', 'CP936': 'a中文b', 'CP949': 'a한똠b', 'CP950': 'a中文b', 'utf-8': 'aé日\u{1F600}b' }[codepage]!;
        const bytes = codepage === 'utf-8' ? Buffer.from(value, 'utf8') : encode(value, codepage);

        for (let split = 0; split <= bytes.length; split++) {
          const decoder = createDecoder(codepage);
          const text = decoder.write(bytes.subarray(0, split)) + decoder.write(Buffer.alloc(0)) + decoder.write(bytes.subarray(split)) + decoder.end();
          assert.strictEqual(text, value, `${codepage}, split at ${split}`);
        }
      }
    });

    it('decodes a lead byte at the end of a streamed value to a replacement character', function() {
      const decoder = createDecoder('CP949');
      assert.strictEqual(decoder.write(Buffer.from([0x61, 0xB0])), 'a');
      assert.strictEqual(decoder.end(), '�');
    });

    describe('if `TextDecoder` does not support a double-byte code page', function() {
      afterEach(function() {
        sinon.restore();
        resetTables();
      });

      it('fails with an error naming the code page', function() {
        resetTables();
        sinon.stub(globalThis, 'TextDecoder').throws(new RangeError('The "shift_jis" encoding is not supported'));

        assert.throws(
          () => decode(Buffer.from([0x82, 0xA0]), 'CP932'),
          Error,
          'Text in code page CP932 requires a Node.js build with full ICU support, but its TextDecoder does not support the \'shift_jis\' encoding.'
        );
      });

      it('still decodes single-byte code pages and ASCII', function() {
        resetTables();
        sinon.stub(globalThis, 'TextDecoder').throws(new RangeError('not supported'));

        assert.strictEqual(decode(Buffer.from([0x63, 0x61, 0x66, 0xE9]), 'CP1252'), 'café');
        assert.strictEqual(decode(Buffer.from('abc'), 'CP932'), 'abc');
      });

      it('fails to encode non-ASCII text in that code page with the same error', function() {
        resetTables();
        sinon.stub(globalThis, 'TextDecoder').throws(new RangeError('not supported'));

        assert.throws(() => encode('日本', 'CP932'), Error, 'Text in code page CP932 requires a Node.js build with full ICU support');
      });

      it('still encodes single-byte code pages and ASCII', function() {
        resetTables();
        sinon.stub(globalThis, 'TextDecoder').throws(new RangeError('not supported'));

        assert.deepEqual(encode('café', 'CP1252'), Buffer.from([0x63, 0x61, 0x66, 0xE9]));
        assert.deepEqual(encode('abc', 'CP932'), Buffer.from('abc'));
      });
    });
  });

  describe('decoding a `varchar(max)` value', function() {
    function metadataFor(collation: Collation): Metadata {
      return {
        userType: 0,
        flags: 0,
        type: TYPES.VarChar,
        collation,
        precision: undefined,
        scale: undefined,
        dataLength: 0xFFFF,
        schema: undefined,
        udtInfo: undefined
      };
    }

    // Serializes a value as PLP chunks of the given sizes.
    function plp(bytes: Buffer, chunkSizes: number[]) {
      const parts = [];
      const length = Buffer.alloc(8);
      length.writeBigUInt64LE(BigInt(bytes.length));
      parts.push(length);

      let offset = 0;
      for (const size of [...chunkSizes, bytes.length]) {
        const end = Math.min(offset + size, bytes.length);
        if (end === offset) {
          continue;
        }
        const header = Buffer.alloc(4);
        header.writeUInt32LE(end - offset);
        parts.push(header, bytes.subarray(offset, end));
        offset = end;
      }

      parts.push(Buffer.alloc(4));
      return Buffer.concat(parts);
    }

    // Reads a PLP value that arrives in parts of the given sizes.
    function read(metadata: Metadata, data: Buffer, partSize: number) {
      const reader = new PLPReader(metadata);
      const parser = { buffer: Buffer.alloc(0), position: 0 } as any;
      let offset = 0;
      while (true) {
        try {
          return reader.read(parser);
        } catch (error) {
          if (!(error instanceof NotEnoughDataError) || offset >= data.length) {
            throw error;
          }
          const remaining = parser.buffer.subarray(parser.position);
          parser.buffer = Buffer.concat([remaining, data.subarray(offset, offset + partSize)]);
          parser.position = 0;
          offset += partSize;
        }
      }
    }

    // Japanese_CI_AS (CP932)
    const japaneseCollation = Collation.fromBuffer(Buffer.from([0x11, 0x04, 0xD0, 0x00, 0x00]));

    it('decodes characters split across PLP chunks', function() {
      for (const [collation, value, bytes] of [
        [japaneseCollation, 'あいう日本', encode('あいう日本', 'CP932')],
        [utf8Collation, 'é日\u{1F600}', Buffer.from('é日\u{1F600}', 'utf8')]
      ] as const) {
        for (let size = 1; size <= bytes.length; size++) {
          const sizes = Array(bytes.length).fill(size);
          assert.strictEqual(read(metadataFor(collation), plp(bytes, sizes), bytes.length + 100), value, `chunks of ${size}`);
        }
      }
    });

    it('decodes characters split across the incoming data', function() {
      const bytes = encode('あいう日本', 'CP932');
      const data = plp(bytes, [3, 4]);
      for (let partSize = 1; partSize <= data.length; partSize++) {
        assert.strictEqual(read(metadataFor(japaneseCollation), data, partSize), 'あいう日本', `parts of ${partSize}`);
      }
    });
  });

  // Compares decoding with `iconv-lite`, which tedious used before, for every
  // single byte and every two-byte sequence in the double-byte code pages.
  //
  // Wherever the two differ, the new decoding is what Windows' own tables for
  // the code page define (WindowsBestFit/bestfit<N>.txt, and PC/CP437.TXT and
  // PC/CP850.TXT, at https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/),
  // which SQL Server also uses to convert `varchar` to `nvarchar`. The
  // differences fall into two kinds:
  //
  // - `iconv-lite` has no mapping for a byte or sequence that Windows maps,
  //   and decodes it to U+FFFD. These are the C1 control characters in the
  //   Windows code pages (CP1252 0x81 is U+0081), the private use characters
  //   Windows maps some unassigned bytes to (CP1253 0xAA is U+F8F9, CP932 0xA0
  //   is U+F8F0), and the user-defined areas of the double-byte code pages
  //   (CP936 0xAAA1 is U+E000, CP950 0x8140 is U+EEB8).
  //
  // - An invalid two-byte sequence, which both decode to U+FFFD, but
  //   `iconv-lite` then decodes the trail byte again, as a character of its own,
  //   while it is part of the invalid sequence here, as in Windows and in the
  //   WHATWG decoders. (A trail byte that is ASCII is a character of its own in
  //   both.)
  //
  // `iconv-lite` never decodes a byte or sequence to a character where it is
  // decoded to U+FFFD here, and the two never decode one to different
  // characters.
  describe('equivalence with `iconv-lite`', function() {
    // The single bytes that decode differently, all of which `iconv-lite`
    // decodes to U+FFFD.
    const singleByteDifferences: { [codepage: string]: number[] } = {
      CP437: [],
      CP850: [],
      CP874: [
        0x81, 0x82, 0x83, 0x84, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x8B, 0x8C, 0x8D, 0x8E, 0x8F, 0x90, 0x98,
        0x99, 0x9A, 0x9B, 0x9C, 0x9D, 0x9E, 0x9F, 0xDB, 0xDC, 0xDD, 0xDE, 0xFC, 0xFD, 0xFE, 0xFF
      ],
      CP1250: [0x81, 0x83, 0x88, 0x90, 0x98],
      CP1251: [0x98],
      CP1252: [0x81, 0x8D, 0x8F, 0x90, 0x9D],
      CP1253: [0x81, 0x88, 0x8A, 0x8C, 0x8D, 0x8E, 0x8F, 0x90, 0x98, 0x9A, 0x9C, 0x9D, 0x9E, 0x9F, 0xAA, 0xD2, 0xFF],
      CP1254: [0x81, 0x8D, 0x8E, 0x8F, 0x90, 0x9D, 0x9E],
      CP1255: [0x81, 0x8A, 0x8C, 0x8D, 0x8E, 0x8F, 0x90, 0x9A, 0x9C, 0x9D, 0x9E, 0x9F, 0xD9, 0xDA, 0xDB, 0xDC, 0xDD, 0xDE, 0xDF, 0xFB, 0xFC, 0xFF],
      CP1256: [],
      CP1257: [0x81, 0x83, 0x88, 0x8A, 0x8C, 0x90, 0x98, 0x9A, 0x9C, 0x9F, 0xA1, 0xA5],
      CP1258: [0x81, 0x8A, 0x8D, 0x8E, 0x8F, 0x90, 0x9A, 0x9D, 0x9E]
    };

    // Characters Windows decodes the differing bytes to, as samples.
    const singleByteSamples: { [codepage: string]: Array<[number, number]> } = {
      CP874: [[0x81, 0x0081], [0xDB, 0xF8C1], [0xFF, 0xF8C8]],
      CP1250: [[0x81, 0x0081], [0x98, 0x0098]],
      CP1251: [[0x98, 0x0098]],
      CP1252: [[0x81, 0x0081], [0x9D, 0x009D]],
      CP1253: [[0xAA, 0xF8F9], [0xD2, 0xF8FA], [0xFF, 0xF8FB]],
      CP1254: [[0x9E, 0x009E]],
      CP1255: [[0xD9, 0xF88D], [0xFF, 0xF896]],
      CP1257: [[0xA1, 0xF8FC], [0xA5, 0xF8FD]],
      CP1258: [[0x81, 0x0081]]
    };

    for (const codepage of SINGLE_BYTE_CODEPAGES) {
      it(`decodes every byte in ${codepage} as \`iconv-lite\` does, except where it has no mapping`, function() {
        const differences = [];
        for (let byte = 0; byte <= 0xFF; byte++) {
          const buf = Buffer.of(byte);
          const expected = iconv.decode(buf, codepage);
          const actual = decode(buf, codepage);
          if (actual !== expected) {
            assert.strictEqual(expected, '�', `0x${byte.toString(16)}`);
            assert.strictEqual(actual.length, 1, `0x${byte.toString(16)}`);
            assert.notStrictEqual(actual, '�', `0x${byte.toString(16)}`);
            differences.push(byte);
          }
        }

        assert.deepEqual(differences, singleByteDifferences[codepage]);

        for (const [byte, char] of singleByteSamples[codepage] ?? []) {
          assert.strictEqual(decode(Buffer.of(byte), codepage), String.fromCharCode(char));
        }
      });
    }

    // How many inputs (single bytes, and two bytes from 0x8000 to 0xFFFF)
    // decode differently, of each kind.
    const doubleByteDifferences: { [codepage: string]: { iconvHasNoMapping: number, invalidSequence: number } } = {
      CP932: { iconvHasNoMapping: 1231, invalidSequence: 1604 },
      CP936: { iconvHasNoMapping: 2281, invalidSequence: 252 },
      CP949: { iconvHasNoMapping: 450, invalidSequence: 2750 },
      CP950: { iconvHasNoMapping: 6479, invalidSequence: 4598 }
    };

    // Characters Windows decodes bytes and sequences to, as samples. They
    // include the bytes and sequences `TextDecoder` does not decode as Windows
    // does, which are corrected in `text-encoding.ts`.
    const doubleByteSamples: { [codepage: string]: Array<[number[], string]> } = {
      CP932: [
        [[0x1A], '\u001A'], [[0x1C], '\u001C'], [[0x7F], '\u007F'], [[0x5C], '\\'], [[0x7E], '~'],
        [[0x80], '\u0080'], [[0xA0], ''], [[0xB1], 'ｱ'], [[0xFD], ''], [[0xFF], ''],
        [[0x81, 0x5F], '＼'], [[0x82, 0xA0], 'あ'], [[0x87, 0x40], '①'], [[0xED, 0x40], '纊'], [[0xFA, 0x40], 'ⅰ']
      ],
      CP936: [
        [[0x80], '€'], [[0xFF], ''], [[0xB0, 0xA1], '啊'], [[0xA1, 0x40], ''], [[0xAA, 0xA1], ''],
        [[0xA2, 0xE3], ''], [[0xA6, 0xD9], ''], [[0xFE, 0x50], ''], [[0xFE, 0xA0], '']
      ],
      CP949: [
        [[0x80], '\u0080'], [[0xFF], ''], [[0xB0, 0xA1], '가'], [[0x81, 0x41], '갂'], [[0xC6, 0x52], '힣'],
        [[0xA2, 0xE6], '€'], [[0xA2, 0xE7], '®'], [[0xC9, 0xA1], '']
      ],
      CP950: [
        [[0x80], '\u0080'], [[0xFF], ''], [[0xA4, 0x40], '一'], [[0xA3, 0xE1], '€'], [[0x81, 0x40], '']
      ]
    };

    for (const codepage of DOUBLE_BYTE_CODEPAGES) {
      it(`decodes every byte and two-byte sequence in ${codepage} as \`iconv-lite\` does, except where it has no mapping or the sequence is invalid`, function() {
        const differences = { iconvHasNoMapping: 0, invalidSequence: 0 };

        const compare = (buf: Buffer) => {
          const expected = iconv.decode(buf, codepage);
          const actual = decode(buf, codepage);
          if (actual === expected) {
            return;
          }

          const description = `${buf.toString('hex')}: iconv-lite ${hex(expected)}, decoded ${hex(actual)}`;
          assert.include(expected, '�', description);
          if (actual.includes('�')) {
            differences.invalidSequence++;
          } else {
            differences.iconvHasNoMapping++;
          }
        };

        for (let byte = 0; byte <= 0xFF; byte++) {
          compare(Buffer.of(byte));
        }

        for (let lead = 0x80; lead <= 0xFF; lead++) {
          for (let trail = 0x00; trail <= 0xFF; trail++) {
            compare(Buffer.of(lead, trail));
          }
        }

        assert.deepEqual(differences, doubleByteDifferences[codepage]);

        for (const [bytes, char] of doubleByteSamples[codepage]) {
          assert.strictEqual(hex(decode(Buffer.from(bytes), codepage)), hex(char), Buffer.from(bytes).toString('hex'));
        }
      });
    }

    // Where `iconv-lite` encodes a character to bytes that decode back to it,
    // it is encoded the same way, except for these CP950 characters that
    // several sequences decode to, where SQL Server picks another one.
    const encodingDifferences: { [codepage: string]: Array<[number, string, string]> } = {
      CP950: [
        [0x2550, 'f9f9', 'a2a4'], [0x255E, 'f9e9', 'a2a5'], [0x2561, 'f9eb', 'a2a7'],
        [0x256A, 'f9ea', 'a2a6'], [0x5341, 'a451', 'a2cc'], [0x5345, 'a4ca', 'a2ce']
      ]
    };

    for (const codepage of ALL_CODEPAGES) {
      it(`encodes every character in ${codepage} as \`iconv-lite\` does where it encodes the character itself`, function() {
        const differences: Array<[number, string, string]> = [];
        for (let char = 0x80; char <= 0xFFFF; char++) {
          if (char >= 0xD800 && char <= 0xDFFF) {
            continue;
          }

          const value = String.fromCharCode(char);
          const expected = iconv.encode(value, codepage);
          if (decode(expected, codepage) !== value) {
            continue;
          }

          const actual = encode(value, codepage);
          if (!actual.equals(expected)) {
            differences.push([char, actual.toString('hex'), expected.toString('hex')]);
          }
        }

        assert.deepEqual(differences, encodingDifferences[codepage] ?? []);
      });
    }
  });
});
