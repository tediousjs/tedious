import { assert } from 'chai';
import { Collation, Flags } from '../../src/collation';

describe('Collation', function() {
  describe('.fromBuffer', function() {
    it('parses a Collation from a Buffer', function() {
      // Chinese_PRC_CI_AS
      {
        const collationBuffer = Buffer.from([ 0x04, 0x08, 0xd0, 0x00, 0x00 ]);
        const collation = Collation.fromBuffer(collationBuffer);

        assert.strictEqual(collation.lcid, 2052);
        assert.strictEqual(collation.flags, 13);
        assert.strictEqual((collation.flags & Flags.IGNORE_CASE), Flags.IGNORE_CASE);
        assert.strictEqual((collation.flags & Flags.IGNORE_ACCENT), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_KANA), Flags.IGNORE_KANA);
        assert.strictEqual((collation.flags & Flags.IGNORE_WIDTH), Flags.IGNORE_WIDTH);
        assert.strictEqual((collation.flags & Flags.BINARY), 0);
        assert.strictEqual((collation.flags & Flags.BINARY2), 0);
        assert.strictEqual((collation.flags & Flags.UTF8), 0);
        assert.strictEqual(collation.version, 0);
        assert.strictEqual(collation.sortId, 0);
        assert.strictEqual(collation.codepage, 'CP936');

        assert.deepEqual(collation.toBuffer(), collationBuffer);
      }

      // Japanese_Bushu_Kakusu_100_CS_AS_KS_WS
      {
        const collationBuffer = Buffer.from([ 0x11, 0x04, 0x04, 0x20, 0x00 ]);
        const collation = Collation.fromBuffer(collationBuffer);

        assert.strictEqual(collation.lcid, 263185);
        assert.strictEqual(collation.flags, 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_CASE), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_ACCENT), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_KANA), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_WIDTH), 0);
        assert.strictEqual((collation.flags & Flags.BINARY), 0);
        assert.strictEqual((collation.flags & Flags.BINARY2), 0);
        assert.strictEqual((collation.flags & Flags.UTF8), 0);
        assert.strictEqual(collation.version, 2);
        assert.strictEqual(collation.sortId, 0);
        assert.strictEqual(collation.codepage, 'CP932');

        assert.deepEqual(collation.toBuffer(), collationBuffer);
      }

      // Japanese_Bushu_Kakusu_140_CI_AI_KS_WS
      {
        const collationBuffer = Buffer.from([ 0x11, 0x04, 0x34, 0x30, 0x00 ]);
        const collation = Collation.fromBuffer(collationBuffer);

        assert.strictEqual(collation.lcid, 263185);
        assert.strictEqual(collation.flags, 3);
        assert.strictEqual((collation.flags & Flags.IGNORE_CASE), Flags.IGNORE_CASE);
        assert.strictEqual((collation.flags & Flags.IGNORE_ACCENT), Flags.IGNORE_ACCENT);
        assert.strictEqual((collation.flags & Flags.IGNORE_KANA), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_WIDTH), 0);
        assert.strictEqual((collation.flags & Flags.BINARY), 0);
        assert.strictEqual((collation.flags & Flags.BINARY2), 0);
        assert.strictEqual((collation.flags & Flags.UTF8), 0);
        assert.strictEqual(collation.version, 3);
        assert.strictEqual(collation.sortId, 0);
        assert.strictEqual(collation.codepage, 'CP932');

        assert.deepEqual(collation.toBuffer(), collationBuffer);
      }

      // Japanese_BIN
      {
        const collationBuffer = Buffer.from([ 0x11, 0x04, 0x00, 0x01, 0x00 ]);
        const collation = Collation.fromBuffer(collationBuffer);

        assert.strictEqual(collation.lcid, 1041);
        assert.strictEqual(collation.flags, 16);
        assert.strictEqual((collation.flags & Flags.IGNORE_CASE), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_ACCENT), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_KANA), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_WIDTH), 0);
        assert.strictEqual((collation.flags & Flags.BINARY), Flags.BINARY);
        assert.strictEqual((collation.flags & Flags.BINARY2), 0);
        assert.strictEqual((collation.flags & Flags.UTF8), 0);
        assert.strictEqual(collation.version, 0);
        assert.strictEqual(collation.sortId, 0);
        assert.strictEqual(collation.codepage, 'CP932');

        assert.deepEqual(collation.toBuffer(), collationBuffer);
      }

      // Japanese_BIN2
      {
        const collationBuffer = Buffer.from([ 0x11, 0x04, 0x00, 0x02, 0x00 ]);
        const collation = Collation.fromBuffer(collationBuffer);

        assert.strictEqual(collation.lcid, 1041);
        assert.strictEqual(collation.flags, 32);
        assert.strictEqual((collation.flags & Flags.IGNORE_CASE), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_ACCENT), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_KANA), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_WIDTH), 0);
        assert.strictEqual((collation.flags & Flags.BINARY), 0);
        assert.strictEqual((collation.flags & Flags.BINARY2), Flags.BINARY2);
        assert.strictEqual((collation.flags & Flags.UTF8), 0);
        assert.strictEqual(collation.version, 0);
        assert.strictEqual(collation.sortId, 0);
        assert.strictEqual(collation.codepage, 'CP932');

        assert.deepEqual(collation.toBuffer(), collationBuffer);
      }

      // SQL_Latin1_General_CP1_CI_AS
      {
        const collationBuffer = Buffer.from([ 0x09, 0x04, 0xd0, 0x00, 0x34 ]);
        const collation = Collation.fromBuffer(collationBuffer);

        assert.strictEqual(collation.lcid, 1033);
        assert.strictEqual(collation.flags, 13);
        assert.strictEqual((collation.flags & Flags.IGNORE_CASE), Flags.IGNORE_CASE);
        assert.strictEqual((collation.flags & Flags.IGNORE_ACCENT), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_KANA), Flags.IGNORE_KANA);
        assert.strictEqual((collation.flags & Flags.IGNORE_WIDTH), Flags.IGNORE_WIDTH);
        assert.strictEqual((collation.flags & Flags.BINARY), 0);
        assert.strictEqual((collation.flags & Flags.BINARY2), 0);
        assert.strictEqual((collation.flags & Flags.UTF8), 0);
        assert.strictEqual(collation.version, 0);
        assert.strictEqual(collation.sortId, 52);
        assert.strictEqual(collation.codepage, 'CP1252');

        assert.deepEqual(collation.toBuffer(), collationBuffer);
      }

      // Latin1_General_100_CI_AS_SC
      {
        const collationBuffer = Buffer.from([ 0x09, 0x04, 0xd0, 0x20, 0x00 ]);
        const collation = Collation.fromBuffer(collationBuffer);

        assert.strictEqual(collation.lcid, 1033);
        assert.strictEqual(collation.flags, 13);
        assert.strictEqual((collation.flags & Flags.IGNORE_CASE), Flags.IGNORE_CASE);
        assert.strictEqual((collation.flags & Flags.IGNORE_ACCENT), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_KANA), Flags.IGNORE_KANA);
        assert.strictEqual((collation.flags & Flags.IGNORE_WIDTH), Flags.IGNORE_WIDTH);
        assert.strictEqual((collation.flags & Flags.BINARY), 0);
        assert.strictEqual((collation.flags & Flags.BINARY2), 0);
        assert.strictEqual((collation.flags & Flags.UTF8), 0);
        assert.strictEqual(collation.version, 2);
        assert.strictEqual(collation.sortId, 0);
        assert.strictEqual(collation.codepage, 'CP1252');

        assert.deepEqual(collation.toBuffer(), collationBuffer);
      }

      // Latin1_General_100_BIN2_UTF8
      {
        const collationBuffer = Buffer.from([ 0x09, 0x04, 0x00, 0x26, 0x00 ]);
        const collation = Collation.fromBuffer(collationBuffer);

        assert.strictEqual(collation.lcid, 1033);
        assert.strictEqual(collation.flags, 96);
        assert.strictEqual((collation.flags & Flags.IGNORE_CASE), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_ACCENT), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_KANA), 0);
        assert.strictEqual((collation.flags & Flags.IGNORE_WIDTH), 0);
        assert.strictEqual((collation.flags & Flags.BINARY), 0);
        assert.strictEqual((collation.flags & Flags.BINARY2), Flags.BINARY2);
        assert.strictEqual((collation.flags & Flags.UTF8), Flags.UTF8);
        assert.strictEqual(collation.version, 2);
        assert.strictEqual(collation.sortId, 0);
        assert.strictEqual(collation.codepage, 'utf-8');

        assert.deepEqual(collation.toBuffer(), collationBuffer);
      }
    });
  });
});
