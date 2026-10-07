import { assert } from 'chai';
import { formatHex } from '../../src/format-hex';

describe('formatHex', function() {
  it('zero-pads to the requested width', function() {
    assert.strictEqual(formatHex(0x0a, 2), '0A');
    assert.strictEqual(formatHex(0x1000, 8), '00001000');
    assert.strictEqual(formatHex(0, 4), '0000');
  });

  it('uses upper-case digits', function() {
    assert.strictEqual(formatHex(0xdeadbeef, 8), 'DEADBEEF');
  });

  it('does not truncate a value wider than the width', function() {
    assert.strictEqual(formatHex(0x12345, 2), '12345');
  });

  it('wraps negative numbers to unsigned 32-bit', function() {
    assert.strictEqual(formatHex(-1, 8), 'FFFFFFFF');
    assert.strictEqual(formatHex(-1, 2), 'FFFFFFFF');
  });
});
