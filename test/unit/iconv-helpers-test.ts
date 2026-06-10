import { assert } from 'chai';
import iconv from 'iconv-lite';

import { decode } from '../../src/iconv-helpers';

describe('decode', function() {
  it('decodes like `iconv.decode` for all collation codepages', function() {
    const codepages = [
      'CP437', 'CP850', 'CP874',
      'CP932', 'CP936', 'CP949', 'CP950',
      'CP1250', 'CP1251', 'CP1252', 'CP1253', 'CP1254',
      'CP1255', 'CP1256', 'CP1257', 'CP1258',
      'utf-8', 'utf8'
    ];

    for (const codepage of codepages) {
      for (const buf of [
        Buffer.from([]),
        Buffer.from('hello world', 'ascii'),
        Buffer.from([0x80, 0x9f, 0xa0, 0xff, 0x41, 0xe5, 0x33])
      ]) {
        assert.strictEqual(decode(buf, codepage), iconv.decode(buf, codepage), `codepage ${codepage}`);
      }
    }
  });

  it('does not leak decoder state between calls for multi-byte codepages', function() {
    // 0x93 starts a two byte sequence in CP932 - decoding a buffer that ends
    // in a truncated sequence must not affect the next call.
    const truncated = Buffer.from([0x93, 0xfa, 0x93]);
    const clean = Buffer.from([0x96, 0x7b]);

    assert.strictEqual(decode(truncated, 'CP932'), iconv.decode(truncated, 'CP932'));
    assert.strictEqual(decode(clean, 'CP932'), iconv.decode(clean, 'CP932'));
    assert.strictEqual(decode(clean, 'CP932'), '本');
  });
});
