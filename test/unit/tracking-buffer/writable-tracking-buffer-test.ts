import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

function assertBuffer(actual: WritableTrackingBuffer, expected: number[]): void {
  const actualData = actual.data;
  const expectedBuffer = Buffer.from(expected);

  const comparisonResult = actualData.equals(expectedBuffer);
  if (!comparisonResult) {
    console.log('actual  ', actualData);
    console.log('expected', expectedBuffer);
    assert.fail('Buffer comparison failed');
  }
}

describe('Writable Tracking Buffer', () => {
  it('should create', () => {
    const buffer = new WritableTrackingBuffer(2);

    assert.isDefined(buffer);
    assert.strictEqual(0, buffer.data.length);
  });

  it('should write unsigned int', function() {
    const buffer = new WritableTrackingBuffer(20);

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

  it('should write signed int', function() {
    const buffer = new WritableTrackingBuffer(2);

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

  it('should write string', function() {
    const buffer = new WritableTrackingBuffer(2, 'ucs2');

    buffer.writeString('abc');

    assertBuffer(buffer, [0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  });

  it('should write BVarChar', function() {
    const buffer = new WritableTrackingBuffer(2, 'ucs2');

    buffer.writeBVarchar('abc');

    assertBuffer(buffer, [0x03, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  });

  it('should write UsVarChar', function() {
    const buffer = new WritableTrackingBuffer(2, 'ucs2');

    buffer.writeUsVarchar('abc');

    assertBuffer(buffer, [0x03, 0x00, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  });

  it('should write 64-bit signed `BigInt`s', function() {
    const buffer = new WritableTrackingBuffer(8);

    buffer.writeBigInt64LE(BigInt('0x0807060504030201'));

    assertBuffer(buffer, [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  });

  it('should write 64-bit unsigned `BigInt`s', function() {
    const buffer = new WritableTrackingBuffer(8);

    buffer.writeBigUInt64LE(BigInt('0xdecafafecacefade'));

    assertBuffer(buffer, [0xde, 0xfa, 0xce, 0xca, 0xfe, 0xfa, 0xca, 0xde]);
  });

  it('should copyFrom', function() {
    const buffer = new WritableTrackingBuffer(10);
    const source = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    buffer.copyFrom(source);
    buffer.writeUInt8(5);

    assertBuffer(buffer, [0x01, 0x02, 0x03, 0x04, 0x05]);
  });
});
