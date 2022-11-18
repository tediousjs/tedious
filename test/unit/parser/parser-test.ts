import { assert } from 'chai';
import {
  Int8,
  UInt8,
  Int16LE,
  UInt16LE,
  Int32LE,
  UInt32LE,
  BigUInt64LE,
  UsVarbyte
} from '../../../src/parser';

describe('Int8', function() {
  it('parses a signed negative char', function() {
    const parser = new Int8();
    const result = parser.parse(Buffer.from('F0', 'hex'), 0);

    assert.isTrue(result.done);
    assert.strictEqual(result.value, -16);
    assert.strictEqual(result.offset, 1);
  });

  it('parses a signed positive char', function() {
    const parser = new Int8();
    const result = parser.parse(Buffer.from('0F', 'hex'), 0);

    assert.isTrue(result.done);
    assert.strictEqual(result.value, 15);
    assert.strictEqual(result.offset, 1);
  });
});

describe('UInt8', function() {
  it('parses an unsigned char', function() {
    const parser = new UInt8();
    const result = parser.parse(Buffer.from('FF', 'hex'), 0);

    assert.isTrue(result.done);
    assert.strictEqual(result.value, 255);
    assert.strictEqual(result.offset, 1);
  });
});

describe('Int16LE', function() {
  it('parses a signed negative short', function() {
    const parser = new Int16LE();
    const result = parser.parse(Buffer.from('00FF', 'hex'), 0);

    assert.isTrue(result.done);
    assert.strictEqual(result.value, -256);
    assert.strictEqual(result.offset, 2);
  });

  it('parses a signed positive short', function() {
    const parser = new Int16LE();
    const result = parser.parse(Buffer.from('FF0F', 'hex'), 0);

    assert.isTrue(result.done);
    assert.strictEqual(result.value, 4095);
    assert.strictEqual(result.offset, 2);
  });

  it('parses a signed short over multiple buffers', function() {
    const parser = new Int16LE();

    {
      const result = parser.parse(Buffer.from('00', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isTrue(result.done);
      assert.strictEqual(result.value, -256);
      assert.strictEqual(result.offset, 1);
    }
  });
});

describe('UInt16LE', function() {
  it('parses an unsigned short', function() {
    const parser = new UInt16LE();
    const result = parser.parse(Buffer.from('FF00', 'hex'), 0);

    assert.isTrue(result.done);
    assert.strictEqual(result.value, 255);
    assert.strictEqual(result.offset, 2);
  });

  it('parses an unsigned short over multiple buffers', function() {
    const parser = new UInt16LE();

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('00', 'hex'), 0);
      assert.isTrue(result.done);
      assert.strictEqual(result.value, 255);
      assert.strictEqual(result.offset, 1);
    }
  });
});

describe('Int32LE', function() {
  it('parses an signed negative integer', function() {
    const parser = new Int32LE();
    const result = parser.parse(Buffer.from('FF00FFFF', 'hex'), 0);

    assert.isTrue(result.done);
    assert.strictEqual(result.value, -65281);
    assert.strictEqual(result.offset, 4);
  });

  it('parses an signed positive integer', function() {
    const parser = new Int32LE();
    const result = parser.parse(Buffer.from('FFFFFF00', 'hex'), 0);

    assert.isTrue(result.done);
    assert.strictEqual(result.value, 16777215);
    assert.strictEqual(result.offset, 4);
  });

  it('parses a signed integer over multiple buffers', function() {
    const parser = new Int32LE();

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('00', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isTrue(result.done);
      assert.strictEqual(result.value, -65281);
      assert.strictEqual(result.offset, 1);
    }
  });
});


describe('UInt32LE', function() {
  it('parses an unsigned integer', function() {
    const parser = new UInt32LE();
    const result = parser.parse(Buffer.from('FF00FFFF', 'hex'), 0);

    assert.isTrue(result.done);
    assert.strictEqual(result.value, 4294902015);
    assert.strictEqual(result.offset, 4);
  });

  it('parses an unsigned integer over multiple buffers', function() {
    const parser = new UInt32LE();

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('00', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isTrue(result.done);
      assert.strictEqual(result.value, 4294902015);
      assert.strictEqual(result.offset, 1);
    }
  });
});

describe('BigUInt64LE', function() {
  it('parses an unsigned bigint', function() {
    const parser = new BigUInt64LE();
    const result = parser.parse(Buffer.from('FF00FFFF00FFFFFF', 'hex'), 0);
    assert.isTrue(result.done);
    assert.strictEqual(result.value, 18446742978492825855n);
    assert.strictEqual(result.offset, 8);
  });

  it('parses an unsigned bigint over multiple buffers', function() {
    const parser = new BigUInt64LE();

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('00', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('00', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('FF', 'hex'), 0);
      assert.isTrue(result.done);
      assert.strictEqual(result.value, 18446742978492825855n);
      assert.strictEqual(result.offset, 1);
    }
  });
});

describe('UsVarbyte', function() {
  it('parses an binary with a length specified using an unsigned short', function() {
    const parser = new UsVarbyte();

    const result = parser.parse(Buffer.from('05000102030405', 'hex'), 0);
    assert.isTrue(result.done);
    assert.strictEqual(result.offset, 7);
  });

  it('parses in chunks', function() {
    const parser = new UsVarbyte();

    {
      const result = parser.parse(Buffer.from('05', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('00', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('01', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('02', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('03', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('04', 'hex'), 0);
      assert.isFalse(result.done);
      assert.isUndefined(result.value);
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('05', 'hex'), 0);
      assert.isTrue(result.done);
      assert.deepEqual(result.value, Buffer.from('0102030405', 'hex'));
      assert.strictEqual(result.offset, 1);
    }
  });
});
