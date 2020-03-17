const TrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;
const JSBI = require('jsbi');

function assertBuffer(actual, expected) {
  actual = actual.data;
  expected = Buffer.from(expected);

  const comparisonResult = actual.equals(expected);
  if (!comparisonResult) {
    console.log('actual  ', actual);
    console.log('expected', expected);
    assert.isOk(false);
  }
}

describe('Wrtiable Tracking Buffer', () => {
  it('should create', () => {
    const buffer = new TrackingBuffer(2);

    assert.isOk(buffer);
    assert.strictEqual(0, buffer.data.length);
  });

  it('should write unsigned int', () => {
    const buffer = new TrackingBuffer(20);

    buffer.writeUInt8(1);
    buffer.writeUInt16LE(2);
    buffer.writeUInt16BE(3);
    buffer.writeUInt32LE(4);
    buffer.writeUInt32BE(5);
    buffer.writeUInt64LE(0x600000007);

    assertBuffer(buffer, [
      0x01,
      0x02,
      0x00,
      0x00,
      0x03,
      0x04,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x05,
      0x07,
      0x00,
      0x00,
      0x00,
      0x06,
      0x00,
      0x00,
      0x00
    ]);
  });

  it('should write signed int', () => {
    const buffer = new TrackingBuffer(2);

    buffer.writeInt8(-1);
    buffer.writeInt16LE(-2);
    buffer.writeInt16BE(-3);
    buffer.writeInt32LE(-4);
    buffer.writeInt32BE(-5);
    buffer.writeInt64LE(-3500000000);

    assertBuffer(buffer, [
      0xff,
      0xfe,
      0xff,
      0xff,
      0xfd,
      0xfc,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xfb,
      0x00,
      0x3d,
      0x62,
      0x2f,
      0xff,
      0xff,
      0xff,
      0xff
    ]);
  });

  it('should write string', () => {
    const buffer = new TrackingBuffer(2, 'ucs2');

    buffer.writeString('abc');

    assertBuffer(buffer, [0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  });

  it('should write BVarChar', () => {
    const buffer = new TrackingBuffer(2, 'ucs2');

    buffer.writeBVarchar('abc');

    assertBuffer(buffer, [0x03, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  });

  it('should write UsVarChar', () => {
    const buffer = new TrackingBuffer(2, 'ucs2');

    buffer.writeUsVarchar('abc');

    assertBuffer(buffer, [0x03, 0x00, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  });

  it('should write 64-bit signed JSBIs', () => {
    const buffer = new TrackingBuffer(8);

    buffer.writeBigInt64LE(JSBI.BigInt('0x0807060504030201'));

    assertBuffer(buffer, [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  });

  it('should write 64-bit unsigned JSBIs', () => {
    const buffer = new TrackingBuffer(8);

    buffer.writeBigUInt64LE(JSBI.BigInt('0xdecafafecacefade'));

    assertBuffer(buffer, [0xde, 0xfa, 0xce, 0xca, 0xfe, 0xfa, 0xca, 0xde]);
  });

  it('should copyFrom', () => {
    const buffer = new TrackingBuffer(10);
    const source = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    buffer.copyFrom(source);
    buffer.writeUInt8(5);

    assertBuffer(buffer, [0x01, 0x02, 0x03, 0x04, 0x05]);
  });
});
