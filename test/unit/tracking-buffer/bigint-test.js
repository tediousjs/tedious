const convertLEBytesToString = require('../../../src/tracking-buffer/bigint').convertLEBytesToString;
const numberToInt64LE = require('../../../src/tracking-buffer/bigint').numberToInt64LE;
const assert = require('chai').assert;


function assertBuffer(actual, expected) {
  for (var i = 0, end = actual.length; i < end; i++) {
    if (actual[i] !== expected[i]) {
      console.log('actual  ', actual);
      console.log('expected', Buffer.from(expected));
      assert.isOk(false);
    }
  }
}

describe('Bigint Test', () => {
  it('should be zero', () => {
    assert.strictEqual(
      '0',
      convertLEBytesToString(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]))
    );
  });

  it('should be small positive', () => {
    assert.strictEqual(
      '1',
      convertLEBytesToString(Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]))
    );
    assert.strictEqual(
      '2',
      convertLEBytesToString(Buffer.from([2, 0, 0, 0, 0, 0, 0, 0]))
    );
  });

  it('should be small negative', () => {
    assert.strictEqual(
      '-1',
      convertLEBytesToString(Buffer.from([255, 255, 255, 255, 255, 255, 255, 255]))
    );
    assert.strictEqual(
      '-2',
      convertLEBytesToString(Buffer.from([254, 255, 255, 255, 255, 255, 255, 255]))
    );
  });

  it('should be big positive', () => {
    assert.strictEqual(
      '9223372036854775807',
      convertLEBytesToString(Buffer.from([255, 255, 255, 255, 255, 255, 255, 127]))
    );
  });

  it('should be big negative', () => {
    assert.strictEqual(
      '-9223372036854775808',
      convertLEBytesToString(Buffer.from([0, 0, 0, 0, 0, 0, 0, 128]))
    );
  });

  it('should be powersOf10', () => {
    assert.strictEqual(
      '10',
      convertLEBytesToString(Buffer.from([10, 0, 0, 0, 0, 0, 0, 0]))
    );
    assert.strictEqual(
      '100',
      convertLEBytesToString(Buffer.from([100, 0, 0, 0, 0, 0, 0, 0]))
    );
    assert.strictEqual(
      '1000',
      convertLEBytesToString(Buffer.from([232, 3, 0, 0, 0, 0, 0, 0]))
    );
    assert.strictEqual(
      '10000',
      convertLEBytesToString(Buffer.from([16, 39, 0, 0, 0, 0, 0, 0]))
    );
  });

  it('should be toInt64LE', () => {
    assertBuffer(numberToInt64LE(-3500000000), [
      0x00,
      0x3d,
      0x62,
      0x2f,
      0xff,
      0xff,
      0xff,
      0xff
    ]);
    assertBuffer(numberToInt64LE(3500000000), [
      0x00,
      0xc3,
      0x9d,
      0xd0,
      0x00,
      0x00,
      0x00,
      0x00
    ]);
    assertBuffer(numberToInt64LE(-2), [
      0xfe,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff
    ]);
    assertBuffer(numberToInt64LE(2), [
      0x02,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00
    ]);
    assertBuffer(numberToInt64LE(0), [
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00
    ]);
    assertBuffer(numberToInt64LE(-5000000000), [
      0x00,
      0x0e,
      0xfa,
      0xd5,
      0xfe,
      0xff,
      0xff,
      0xff
    ]);
    assertBuffer(numberToInt64LE(5000000000), [
      0x00,
      0xf2,
      0x05,
      0x2a,
      0x01,
      0x00,
      0x00,
      0x00
    ]);
    assertBuffer(numberToInt64LE(5201683247893), [
      0x15,
      0x73,
      0x7b,
      0x1c,
      0xbb,
      0x04,
      0x00,
      0x00
    ]);
    assertBuffer(numberToInt64LE(-5201683247893), [
      0xeb,
      0x8c,
      0x84,
      0xe3,
      0x44,
      0xfb,
      0xff,
      0xff
    ]);
  });
});
