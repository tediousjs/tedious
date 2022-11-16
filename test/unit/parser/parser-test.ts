import { assert } from 'chai';
import { UInt16LE, UsVarbyte } from '../../../src/parser';

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
      assert.strictEqual(result.offset, 1);
    }

    {
      const result = parser.parse(Buffer.from('00', 'hex'), 0);
      assert.isTrue(result.done);
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
