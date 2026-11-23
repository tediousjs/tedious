import { assert } from 'chai';
import { createHash, type Hash } from 'crypto';

import { createDecoder, createEncoder, decode, encode } from '../../src/text-encoding';
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
      assert.deepEqual(encode('a\u2008b', 'CP1252'), Buffer.from('a b'));
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

    it('fails to encode or decode text in an unsupported code page', function() {
      assert.throws(() => encode('abc', 'CP1'), Error, 'Unsupported code page: CP1.');
      assert.throws(() => encode('é', 'CP1'), Error, 'Unsupported code page: CP1.');
      assert.throws(() => createEncoder('CP1'), Error, 'Unsupported code page: CP1.');
      assert.throws(() => decode(Buffer.from('abc'), 'CP1'), Error, 'Unsupported code page: CP1.');
      assert.throws(() => createDecoder('CP1'), Error, 'Unsupported code page: CP1.');
      // Names of the objects' own properties only.
      assert.throws(() => encode('é', 'constructor'), Error, 'Unsupported code page: constructor.');
      assert.throws(() => decode(Buffer.from([0xE9]), 'toString'), Error, 'Unsupported code page: toString.');
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
      const value = '\uFEFFhéllo \u{1F600}';
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
      assert.strictEqual(decode(Buffer.from([0x48, 0x82, 0x6C, 0x8A, 0xFF]), 'CP437'), 'Hélè\u00A0');
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
  // encodes, as SQL Server converts it. These hashes, of each range of inputs,
  // were recorded from the output that `test/integration/codepage-test.ts`
  // checks against SQL Server, and match hashes of SQL Server's own
  // conversions. If a change to the tables changes one, check that range
  // against SQL Server with that test.
  describe('conversion of every input', function() {
    // The ranges of byte sequences: the single bytes, and in a double-byte code
    // page, the two-byte sequences of each 16 lead bytes from 0x80.
    function decodingRanges(codepage: string): Array<[name: string, inputs: Buffer[]]> {
      const ranges: Array<[string, Buffer[]]> = [['bytes 0x00 to 0xFF', Array.from({ length: 256 }, (_, byte) => Buffer.of(byte))]];
      if (DOUBLE_BYTE_CODEPAGES.includes(codepage)) {
        for (let first = 0x80; first <= 0xFF; first += 0x10) {
          const inputs = [];
          for (let lead = first; lead < first + 0x10; lead++) {
            for (let trail = 0x00; trail <= 0xFF; trail++) {
              inputs.push(Buffer.of(lead, trail));
            }
          }
          ranges.push([`sequences 0x${first.toString(16).toUpperCase()}00 to 0x${(first + 0x0F).toString(16).toUpperCase()}FF`, inputs]);
        }
      }
      return ranges;
    }

    function rangeHash(update: (hash: Hash) => void) {
      const hash = createHash('sha256');
      update(hash);
      return hash.digest('hex').slice(0, 8);
    }

    const hashes: { [codepage: string]: { decoding: string[], encoding: string[] } } = {
      CP437: {
        decoding: ['ea22d525'],
        encoding: [
          '70276327', '89e62983', '73a2ee20', '5c92c8e8', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '6cd81641'
        ]
      },
      CP850: {
        decoding: ['a1a79177'],
        encoding: [
          'aa0a5231', '89e62983', 'ccb1b989', '6a63d00a', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '6cd81641'
        ]
      },
      CP874: {
        decoding: ['8945a495'],
        encoding: [
          '6a7bfba6', '89e62983', 'ef85043c', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '8e3fa9e7'
        ]
      },
      CP1250: {
        decoding: ['3ffa1e18'],
        encoding: [
          '7958da87', '89e62983', '167ba867', '3783d86f', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '6cd81641'
        ]
      },
      CP1251: {
        decoding: ['26067470'],
        encoding: [
          'c1076d1d', '89e62983', 'a0295c91', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '6cd81641'
        ]
      },
      CP1252: {
        decoding: ['94e2f849'],
        encoding: [
          '0433f7a2', '89e62983', 'fb1d7269', 'a54ca469', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '6cd81641'
        ]
      },
      CP1253: {
        decoding: ['9f301e77'],
        encoding: [
          'c8674b97', '89e62983', 'ea54df05', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '0f6f2619'
        ]
      },
      CP1254: {
        decoding: ['ffb420a8'],
        encoding: [
          'b0bcfd74', '89e62983', 'fe0fc797', '8d0b0354', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '6cd81641'
        ]
      },
      CP1255: {
        decoding: ['16959000'],
        encoding: [
          'b165193c', '89e62983', 'f7111e57', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '189fb5bd'
        ]
      },
      CP1256: {
        decoding: ['0760c0d2'],
        encoding: [
          '3ca6c126', '89e62983', '853306fe', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '3977136a'
        ]
      },
      CP1257: {
        decoding: ['6623460c'],
        encoding: [
          '66c03c45', '89e62983', '86a7a0da', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '37e02437'
        ]
      },
      CP1258: {
        decoding: ['bf19376d'],
        encoding: [
          '42ee2b02', '89e62983', 'a6f75e7b', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983',
          '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '89e62983', '6cd81641'
        ]
      },
      CP932: {
        decoding: ['7ee98277', 'b779aa1e', 'cb01fae7', 'a848c9f1', '760544b8', '2c1060a3', 'f28db98f', '527a4d06', 'b1c80eed'],
        encoding: [
          '47be82bc', '89e62983', 'c8aebf11', 'a9ed7d4d', 'a789d2ce', '9d0e36b7', '2de3d76e', '61b50063',
          '7b4b864b', 'b0e2ec18', '89e62983', '89e62983', '89e62983', '89e62983', '379d819d', 'b8c00c02'
        ]
      },
      CP936: {
        decoding: ['b79bfa61', '6fd63694', '9c879339', '134c899d', '04ef72b6', 'e6564190', 'e47c2797', 'e573a609', '2acb2805'],
        encoding: [
          'eefff454', '89e62983', '7f4fddfb', 'a9c7e12e', '4af93fb0', '01467672', '6bf657ad', '2618bb5f',
          '6e22857e', 'ae93ce68', '89e62983', '89e62983', '89e62983', '89e62983', '3109b560', '8c73c8b5'
        ]
      },
      CP949: {
        decoding: ['f6f14ecd', 'aa3c157e', '3701f4ea', '45515c55', '745c8335', 'c226604e', 'a848dc1c', 'f52e6a92', '66a372ba'],
        encoding: [
          'e3078bee', 'abf08c0f', '963e9500', '751bafe1', '4e5a02d9', '520e8e0f', '5b0fbeee', 'b3b9c188',
          '2c15e452', '0f6f8868', '18e7f0c5', '63b3bad0', '123c3481', '2aafd1dd', '25a13747', '5dd69f59'
        ]
      },
      CP950: {
        decoding: ['4c263a80', 'b0bf1d02', '334e18c1', 'a4b162a8', '4c317b3e', '5974492e', 'fac3ec7c', '059ace5c', '765a5f04'],
        encoding: [
          'c83ecd71', '89e62983', '3dc6c97b', 'cf60afbe', '40996066', '0af04563', 'cc8151d2', 'bb44e0c7',
          'beb4fac7', 'efaff531', '89e62983', '89e62983', '89e62983', '89e62983', 'a62bdac6', 'c8eb6e36'
        ]
      }
    };

    for (const codepage of ALL_CODEPAGES) {
      it(`decodes every byte sequence in ${codepage} as SQL Server does`, function() {
        const differing = [];
        for (const [i, [name, inputs]] of decodingRanges(codepage).entries()) {
          const actual = rangeHash((hash) => {
            for (const buf of inputs) {
              hash.update(Buffer.from(decode(buf, codepage) + '\n', 'utf16le'));
            }
          });
          if (actual !== hashes[codepage].decoding[i]) {
            differing.push(name);
          }
        }

        assert.deepEqual(differing, [], 'decoded differently');
      });

      it(`encodes every UTF-16 code unit in ${codepage} as SQL Server does`, function() {
        const differing = [];
        for (let i = 0; i < 16; i++) {
          const actual = rangeHash((hash) => {
            for (let unit = i * 0x1000; unit < (i + 1) * 0x1000; unit++) {
              const bytes = encode(String.fromCharCode(unit), codepage);
              hash.update(Buffer.of(bytes.length));
              hash.update(bytes);
            }
          });
          if (actual !== hashes[codepage].encoding[i]) {
            differing.push(`U+${(i * 0x1000).toString(16).toUpperCase().padStart(4, '0')} to U+${(i * 0x1000 + 0xFFF).toString(16).toUpperCase().padStart(4, '0')}`);
          }
        }

        assert.deepEqual(differing, [], 'encoded differently');
      });
    }
  });

  // Characters Windows' own tables for each code page (WindowsBestFit/
  // bestfit<N>.txt, and PC/CP437.TXT and PC/CP850.TXT, at
  // https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/) decode bytes and
  // sequences to, as samples. They include the C1 control characters, the
  // private use characters Windows maps some bytes to, the user-defined areas
  // of the double-byte code pages, and bytes and sequences that Node.js'
  // `TextDecoder` decodes differently.
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
        [[0x80], '\u0080'], [[0xA0], '\uF8F0'], [[0xB1], 'ｱ'], [[0xFD], '\uF8F1'], [[0xFF], '\uF8F3'],
        [[0x81, 0x5F], '＼'], [[0x82, 0xA0], 'あ'], [[0x87, 0x40], '①'], [[0xED, 0x40], '纊'], [[0xFA, 0x40], 'ⅰ']
      ],
      CP936: [
        [[0x80], '€'], [[0xFF], '\uF8F5'], [[0xB0, 0xA1], '啊'], [[0xA1, 0x40], '\uE4C6'], [[0xAA, 0xA1], '\uE000'],
        [[0xA2, 0xE3], '\uE76C'], [[0xA6, 0xD9], '\uE78D'], [[0xFE, 0x50], '\uE815'], [[0xFE, 0xA0], '\uE864']
      ],
      CP949: [
        [[0x80], '\u0080'], [[0xFF], '\uF8F7'], [[0xB0, 0xA1], '가'], [[0x81, 0x41], '갂'], [[0xC6, 0x52], '힣'],
        [[0xA2, 0xE6], '€'], [[0xA2, 0xE7], '®'], [[0xC9, 0xA1], '\uE000']
      ],
      CP950: [
        [[0x80], '\u0080'], [[0xFF], '\uF8F8'], [[0xA4, 0x40], '一'], [[0xA3, 0xE1], '€'], [[0x81, 0x40], '\uEEB8']
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
