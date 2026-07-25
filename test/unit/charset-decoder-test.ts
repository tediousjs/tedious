import { assert } from 'chai';
import iconv from 'iconv-lite';

import { decodeChars } from '../../src/charset-decoder';
import { codepageByLanguageId, codepageBySortId } from '../../src/collation';

// Every character set a `Collation` can select, plus the `utf8` fallback that
// is used when a collation carries no code page.
const ENCODINGS = [...new Set([
  'utf8',
  // `Collation` uses this for UTF-8 enabled collations.
  'utf-8',
  ...Object.values(codepageByLanguageId),
  ...Object.values(codepageBySortId)
])].sort();

describe('decodeChars', function() {
  it('covers every code page tedious can select', function() {
    assert.deepEqual(ENCODINGS, [
      'CP1250', 'CP1251', 'CP1252', 'CP1253', 'CP1254', 'CP1255', 'CP1256',
      'CP1257', 'CP1258', 'CP437', 'CP850', 'CP874', 'CP932', 'CP936',
      'CP949', 'CP950', 'utf-8', 'utf8'
    ]);
  });

  for (const encoding of ENCODINGS) {
    describe(encoding, function() {
      it('matches `iconv-lite` for every single byte value', function() {
        for (let i = 0; i < 256; i++) {
          const buf = Buffer.from([i]);
          assert.strictEqual(
            decodeChars(buf, 0, 1, encoding),
            iconv.decode(buf, encoding),
            'byte 0x' + i.toString(16)
          );
        }
      });

      it('matches `iconv-lite` for every two byte sequence', function() {
        const buf = Buffer.allocUnsafe(2);

        for (let i = 0; i < 256; i++) {
          buf[0] = i;

          for (let j = 0; j < 256; j++) {
            buf[1] = j;

            const actual = decodeChars(buf, 0, 2, encoding);
            const expected = iconv.decode(buf, encoding);

            if (actual !== expected) {
              assert.fail(actual, expected, 'bytes ' + buf.toString('hex'));
            }
          }
        }
      });

      it('decodes only the requested slice', function() {
        const buf = Buffer.from([0xFF, 0x41, 0x42, 0x43, 0xFF]);

        assert.strictEqual(
          decodeChars(buf, 1, 4, encoding),
          iconv.decode(buf.subarray(1, 4), encoding)
        );
      });

      it('decodes an empty slice', function() {
        assert.strictEqual(decodeChars(Buffer.from([0x41]), 0, 0, encoding), '');
      });

      it('matches `iconv-lite` for longer mixed content', function() {
        const buf = Buffer.allocUnsafe(4096);
        // Deterministic pseudo-random bytes.
        let state = 12345;
        for (let i = 0; i < buf.length; i++) {
          state = (state * 1103515245 + 12345) & 0x7FFFFFFF;
          buf[i] = (state >> 16) & 0xFF;
        }

        assert.strictEqual(decodeChars(buf, 0, buf.length, encoding), iconv.decode(buf, encoding));
      });
    });
  }

  it('defers unknown encodings to `iconv-lite`', function() {
    assert.throws(() => {
      decodeChars(Buffer.from([0x41]), 0, 1, 'definitely-not-an-encoding');
    }, /Encoding not recognized/);
  });
});
