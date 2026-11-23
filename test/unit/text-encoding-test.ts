import { assert } from 'chai';
import sinon from 'sinon';
import { createHash } from 'crypto';

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

    it('decodes an invalid two-byte sequence to the code page\'s default character, as SQL Server does', function() {
      // A lead byte and any other byte, even an ASCII one, are decoded as one.
      assert.strictEqual(decode(Buffer.from([0x82, 0x20, 0x61]), 'CP932'), '・a');
      assert.strictEqual(decode(Buffer.from([0x81, 0xFF, 0x61]), 'CP932'), '・a');
      assert.strictEqual(decode(Buffer.from([0x81, 0x20, 0x61]), 'CP949'), '?a');
      assert.strictEqual(decode(Buffer.from([0x81, 0x7F]), 'CP950'), '?');
      assert.strictEqual(decode(Buffer.from([0xFF, 0x30]), 'CP936'), '\uF8F50');
    });

    it('decodes a lead byte followed by 0x00 to the default character and U+0000', function() {
      assert.strictEqual(decode(Buffer.from([0x82, 0x00, 0x61]), 'CP932'), '・\u0000a');
      assert.strictEqual(decode(Buffer.from([0x81, 0x00]), 'CP936'), '?\u0000');
    });

    it('decodes a lead byte at the end of a value to the default character', function() {
      assert.strictEqual(decode(Buffer.from([0x61, 0x82]), 'CP932'), 'a・');
      assert.strictEqual(decode(Buffer.from([0x61, 0xB0]), 'CP949'), 'a?');
    });

    it('decodes invalid UTF-8 as SQL Server does', function() {
      // A lead byte and a continuation byte out of its range are one error.
      assert.strictEqual(decode(Buffer.from('eda080', 'hex'), 'utf-8'), '\uFFFD\uFFFD');
      assert.strictEqual(decode(Buffer.from('eda061', 'hex'), 'utf-8'), '\uFFFDa');
      assert.strictEqual(decode(Buffer.from('e08080', 'hex'), 'utf-8'), '\uFFFD\uFFFD');
      assert.strictEqual(decode(Buffer.from('f0808080', 'hex'), 'utf-8'), '\uFFFD\uFFFD\uFFFD');
      assert.strictEqual(decode(Buffer.from('f4908061', 'hex'), 'utf-8'), '\uFFFD\uFFFDa');
      // Others are one error per byte, as in the WHATWG decoder.
      assert.strictEqual(decode(Buffer.from('61c362ff', 'hex'), 'utf-8'), 'a\uFFFDb\uFFFD');
      // And valid sequences with these lead bytes are characters.
      assert.strictEqual(decode(Buffer.from('e0a080ed9fbff0908080f48fbfbf', 'hex'), 'utf-8'), '\u0800\uD7FF\u{10000}\u{10FFFF}');
    });

    it('decodes streamed invalid UTF-8 as a whole value would be, at every split', function() {
      const bytes = Buffer.from('61eda080e08080f0808080f48fbfbfc3a9f4908061eda061ed', 'hex');
      const expected = decode(bytes, 'utf-8');
      for (let split = 0; split <= bytes.length; split++) {
        const decoder = createDecoder('utf-8');
        const text = decoder.write(bytes.subarray(0, split)) + decoder.write(Buffer.alloc(0)) + decoder.write(bytes.subarray(split)) + decoder.end();
        assert.strictEqual(text, expected, `split at ${split}`);
      }
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

    it('decodes a lead byte at the end of a streamed value to the default character', function() {
      const decoder = createDecoder('CP949');
      assert.strictEqual(decoder.write(Buffer.from([0x61, 0xB0])), 'a');
      assert.strictEqual(decoder.end(), '?');
    });

    it('decodes an invalid sequence split across the parts of a streamed value as a whole', function() {
      const decoder = createDecoder('CP932');
      assert.strictEqual(decoder.write(Buffer.from([0x61, 0x82])) + decoder.write(Buffer.from([0x20, 0x62])) + decoder.end(), 'a・b');
    });

    describe('without `TextDecoder` support for the legacy code pages', function() {
      afterEach(function() {
        sinon.restore();
        resetTables();
      });

      // As on a Node.js build without full ICU, where `TextDecoder` only
      // supports UTF-8 and UTF-16. tedious does not use it for code pages.
      it('decodes and encodes every code page', function() {
        resetTables();
        const OriginalTextDecoder = globalThis.TextDecoder;
        sinon.stub(globalThis, 'TextDecoder').callsFake(function(label?: string, options?: ConstructorParameters<typeof TextDecoder>[1]) {
          if (label !== undefined && label !== 'utf-8') {
            throw new RangeError(`The "${label}" encoding is not supported`);
          }
          return new OriginalTextDecoder(label, options);
        });

        assert.strictEqual(decode(Buffer.from([0x63, 0x61, 0x66, 0xE9]), 'CP1252'), 'café');
        assert.strictEqual(decode(Buffer.from([0x93, 0xFA, 0x96, 0x7B]), 'CP932'), '日本');
        assert.strictEqual(decode(Buffer.from([0xC7, 0xD1, 0x8C, 0x63]), 'CP949'), '한똠');
        assert.deepEqual(encode('日本', 'CP932'), Buffer.from([0x93, 0xFA, 0x96, 0x7B]));
        assert.deepEqual(encode('中文', 'CP936'), Buffer.from([0xD6, 0xD0, 0xCE, 0xC4]));
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

  // Every single byte (and, in the double-byte code pages, every two-byte
  // sequence from 0x8000 to 0xFFFF) decodes, and every UTF-16 code unit
  // encodes, as SQL Server converts it: these hashes were recorded from the
  // output that `test/integration/codepage-test.ts` checks against SQL Server,
  // and match hashes of SQL Server's own conversions. If a change to the tables
  // changes one, check it against SQL Server with that test.
  describe('conversion of every input', function() {
    const hashes: { [codepage: string]: { decoding: string, encoding: string } } = {
      CP437: { decoding: 'ea22d525a593bc3e', encoding: '0a2f605aa2b0b0c7' },
      CP850: { decoding: 'a1a7917730e355f1', encoding: '4b77c18510d32149' },
      CP874: { decoding: '8945a4955da0189c', encoding: 'e0b4591074a6958d' },
      CP1250: { decoding: '3ffa1e185a6595f5', encoding: '70d698e671d742a3' },
      CP1251: { decoding: '26067470e4fc6bcd', encoding: '38ed28d889b611cc' },
      CP1252: { decoding: '94e2f8494a2525a7', encoding: '08e2dac05daa77f7' },
      CP1253: { decoding: '9f301e773f264860', encoding: '6f34c50a4b2fcae4' },
      CP1254: { decoding: 'ffb420a8fe95346f', encoding: 'ecbb2557b784b7fb' },
      CP1255: { decoding: '16959000e2d8df26', encoding: '127954a94403289c' },
      CP1256: { decoding: '0760c0d2abe2ae75', encoding: 'd01b3b228dcf1f7e' },
      CP1257: { decoding: '6623460ce19cfb5d', encoding: '2e228e61af151118' },
      CP1258: { decoding: 'bf19376d5405c712', encoding: 'c0a37706d962cac0' },
      CP932: { decoding: 'dc20aa1c62e742c2', encoding: '86c70a39b8cc874d' },
      CP936: { decoding: '599fe7edd0ab5801', encoding: 'd4fb917161fa2c52' },
      CP949: { decoding: 'df6fb538e168c066', encoding: '9260fd1010203925' },
      CP950: { decoding: '7f156c3d9b9215cc', encoding: '0f347d6401e7671c' }
    };

    for (const codepage of ALL_CODEPAGES) {
      it(`decodes every byte sequence in ${codepage} as SQL Server does`, function() {
        const hash = createHash('sha256');
        const add = (buf: Buffer) => {
          hash.update(Buffer.from(decode(buf, codepage) + '\n', 'utf16le'));
        };

        for (let byte = 0; byte <= 0xFF; byte++) {
          add(Buffer.of(byte));
        }
        if (DOUBLE_BYTE_CODEPAGES.includes(codepage)) {
          for (let lead = 0x80; lead <= 0xFF; lead++) {
            for (let trail = 0x00; trail <= 0xFF; trail++) {
              add(Buffer.of(lead, trail));
            }
          }
        }

        assert.strictEqual(hash.digest('hex').slice(0, 16), hashes[codepage].decoding);
      });

      it(`encodes every UTF-16 code unit in ${codepage} as SQL Server does`, function() {
        const hash = createHash('sha256');
        for (let unit = 0; unit <= 0xFFFF; unit++) {
          const bytes = encode(String.fromCharCode(unit), codepage);
          hash.update(Buffer.of(bytes.length));
          hash.update(bytes);
        }

        assert.strictEqual(hash.digest('hex').slice(0, 16), hashes[codepage].encoding);
      });
    }
  });

  // Characters Windows' own tables for each code page (WindowsBestFit/
  // bestfit<N>.txt, and PC/CP437.TXT and PC/CP850.TXT, at
  // https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/) decode bytes and
  // sequences to, as samples. They include the C1 control characters, the
  // private use characters Windows maps some bytes to, the user-defined areas
  // of the double-byte code pages, and the bytes and sequences `TextDecoder`
  // does not decode as Windows does, which are corrected in `text-encoding.ts`.
  describe('decoding samples from Windows\' tables', function() {
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

    for (const [codepage, samples] of Object.entries(singleByteSamples)) {
      it(`decodes ${codepage} as Windows does`, function() {
        for (const [byte, char] of samples) {
          assert.strictEqual(decode(Buffer.of(byte), codepage), String.fromCharCode(char), `0x${byte.toString(16)}`);
        }
      });
    }

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

    for (const [codepage, samples] of Object.entries(doubleByteSamples)) {
      it(`decodes ${codepage} as Windows does`, function() {
        for (const [bytes, char] of samples) {
          assert.strictEqual(hex(decode(Buffer.from(bytes), codepage)), hex(char), Buffer.from(bytes).toString('hex'));
        }
      });
    }
  });
});
