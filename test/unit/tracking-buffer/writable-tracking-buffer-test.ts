import WritableTrackingBuffer, { CHUNK_SIZE } from '../../../src/tracking-buffer/writable-tracking-buffer';
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
  it('should create', function() {
    const buffer = new WritableTrackingBuffer();

    assert.isDefined(buffer);
    assert.strictEqual(0, buffer.data.length);
  });

  it('should write unsigned int', function() {
    const buffer = new WritableTrackingBuffer();

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
    const buffer = new WritableTrackingBuffer();

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
    const buffer = new WritableTrackingBuffer();

    buffer.writeString('abc', 'ucs2');

    assertBuffer(buffer, [0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  });

  it('should write BVarChar', function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeBVarchar('abc', 'ucs2');

    assertBuffer(buffer, [0x03, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  });

  it('should write UsVarChar', function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeUsVarchar('abc', 'ucs2');

    assertBuffer(buffer, [0x03, 0x00, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  });

  it('should write 64-bit signed `BigInt`s', function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeBigInt64LE(BigInt('0x0807060504030201'));

    assertBuffer(buffer, [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  });

  it('should write 64-bit unsigned `BigInt`s', function() {
    const buffer = new WritableTrackingBuffer();

    buffer.writeBigUInt64LE(BigInt('0xdecafafecacefade'));

    assertBuffer(buffer, [0xde, 0xfa, 0xce, 0xca, 0xfe, 0xfa, 0xca, 0xde]);
  });

  it('should write buffers', function() {
    const buffer = new WritableTrackingBuffer();
    const source = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    buffer.writeBuffer(source);
    buffer.writeUInt8(5);

    assertBuffer(buffer, [0x01, 0x02, 0x03, 0x04, 0x05]);
  });

  it('starts out empty', () => {
    const buffer = new WritableTrackingBuffer();
    assert.strictEqual(buffer.length, 0);
    assert.deepEqual(buffer.getBuffers(), []);
    assert.deepEqual(buffer.slice(), Buffer.alloc(0));
  });

  it('returns stable data across later writes', () => {
    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(1);
    buffer.writeUInt8(2);

    const first = buffer.data;
    buffer.writeUInt8(3);
    buffer.append(Buffer.alloc(CHUNK_SIZE, 4));
    buffer.writeUInt8(5);

    assert.deepEqual(first, Buffer.from([1, 2]));
    assert.strictEqual(buffer.data.length, 3 + CHUNK_SIZE + 1);
    assert.deepEqual(buffer.data.subarray(0, 3), Buffer.from([1, 2, 3]));
    assert.strictEqual(buffer.data[3 + CHUNK_SIZE], 5);
  });

  it('coalesces small appended buffers into a single chunk', () => {
    const buffer = new WritableTrackingBuffer();
    buffer.append(Buffer.from([1, 2]));
    buffer.append(Buffer.from([3]));
    buffer.append([Buffer.from([4]), Buffer.from([5, 6])]);

    assert.strictEqual(buffer.length, 6);
    const buffers = buffer.getBuffers();
    assert.lengthOf(buffers, 1);
    assert.deepEqual(buffers[0], Buffer.from([1, 2, 3, 4, 5, 6]));
  });

  it('references large buffers instead of copying them', () => {
    const buffer = new WritableTrackingBuffer();
    const large = Buffer.alloc(CHUNK_SIZE, 0x42);
    buffer.append(Buffer.from([1]));
    buffer.append(large);
    buffer.append(Buffer.from([2]));

    const buffers = buffer.getBuffers();
    assert.lengthOf(buffers, 3);
    assert.deepEqual(buffers[0], Buffer.from([1]));
    assert.strictEqual(buffers[1], large);
    assert.deepEqual(buffers[2], Buffer.from([2]));
    assert.strictEqual(buffer.length, CHUNK_SIZE + 2);
  });

  it('never produces coalesced chunks larger than the chunk size', () => {
    const buffer = new WritableTrackingBuffer();
    const piece = Buffer.alloc(1000, 0x01);
    for (let i = 0; i < 100; i++) {
      buffer.append(piece);
    }

    const buffers = buffer.getBuffers();
    assert.isAbove(buffers.length, 1);
    for (const chunk of buffers) {
      assert.isAtMost(chunk.length, CHUNK_SIZE);
    }
    assert.deepEqual(buffer.slice(), Buffer.alloc(100 * 1000, 0x01));
  });

  it('encodes strings', () => {
    const buffer = new WritableTrackingBuffer();
    buffer.append('héllo 🎉', 'ucs2');
    buffer.append('héllo 🎉', 'utf8');
    buffer.append('x'.repeat(100), 'ucs2');

    const expected = Buffer.concat([
      Buffer.from('héllo 🎉', 'ucs2'),
      Buffer.from('héllo 🎉', 'utf8'),
      Buffer.from('x'.repeat(100), 'ucs2')
    ]);
    assert.deepEqual(buffer.slice(), expected);
    assert.strictEqual(buffer.length, expected.length);
  });

  it('writes fixed-width values', () => {
    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xFF);
    buffer.writeInt8(-1);
    buffer.writeUInt16LE(0x1234);
    buffer.writeInt16LE(-2);
    buffer.writeUInt32LE(0xDEADBEEF);
    buffer.writeInt32LE(-3);
    buffer.writeBigUInt64LE(0xFFFFFFFFFFFFFFFFn);
    buffer.writeBigInt64LE(-4n);
    buffer.writeFloatLE(1.5);
    buffer.writeDoubleLE(-2.25);

    const expected = Buffer.alloc(1 + 1 + 2 + 2 + 4 + 4 + 8 + 8 + 4 + 8);
    let offset = 0;
    offset = expected.writeUInt8(0xFF, offset);
    offset = expected.writeInt8(-1, offset);
    offset = expected.writeUInt16LE(0x1234, offset);
    offset = expected.writeInt16LE(-2, offset);
    offset = expected.writeUInt32LE(0xDEADBEEF, offset);
    offset = expected.writeInt32LE(-3, offset);
    offset = expected.writeBigUInt64LE(0xFFFFFFFFFFFFFFFFn, offset);
    offset = expected.writeBigInt64LE(-4n, offset);
    offset = expected.writeFloatLE(1.5, offset);
    expected.writeDoubleLE(-2.25, offset);

    assert.deepEqual(buffer.slice(), expected);
    assert.strictEqual(buffer.length, expected.length);
  });

  it('keeps writes contiguous across chunk boundaries', () => {
    const buffer = new WritableTrackingBuffer();
    // Fill up to just below the first chunk boundary, then write a value
    // that does not fit into the remaining space.
    buffer.append(Buffer.alloc(1023, 0x00));
    buffer.writeUInt32LE(0x01020304);

    const data = buffer.slice();
    assert.strictEqual(data.readUInt32LE(1023), 0x01020304);
    for (const chunk of buffer.getBuffers()) {
      assert.isAtMost(chunk.length, CHUNK_SIZE);
    }
  });

  it('consumes bytes from the front', () => {
    const buffer = new WritableTrackingBuffer();
    buffer.append(Buffer.from([1, 2, 3, 4, 5]));

    const before = buffer.getBuffers();
    buffer.consume(2);
    assert.strictEqual(buffer.length, 3);
    assert.deepEqual(buffer.slice(), Buffer.from([3, 4, 5]));

    // a previously returned list of buffers is unaffected
    assert.deepEqual(before, [Buffer.from([1, 2, 3, 4, 5])]);

    buffer.consume(3);
    assert.strictEqual(buffer.length, 0);
    assert.deepEqual(buffer.getBuffers(), []);

    buffer.append(Buffer.from([6]));
    assert.deepEqual(buffer.slice(), Buffer.from([6]));
  });

  it('consumes across chunks', () => {
    const buffer = new WritableTrackingBuffer();
    const large = Buffer.alloc(CHUNK_SIZE, 0x42);
    buffer.append(Buffer.from([1, 2]));
    buffer.append(large);
    buffer.append(Buffer.from([3]));

    buffer.consume(2 + CHUNK_SIZE - 1);
    assert.strictEqual(buffer.length, 2);
    assert.deepEqual(buffer.slice(), Buffer.from([0x42, 3]));
  });

  it('slices ranges', () => {
    const buffer = new WritableTrackingBuffer();
    buffer.append(Buffer.from([1, 2, 3]));
    buffer.append(Buffer.alloc(CHUNK_SIZE, 4));
    buffer.append(Buffer.from([5, 6]));

    assert.deepEqual(buffer.slice(1, 3), Buffer.from([2, 3]));
    assert.deepEqual(buffer.slice(2, 5), Buffer.from([3, 4, 4]));
    assert.deepEqual(buffer.slice(CHUNK_SIZE + 2), Buffer.from([4, 5, 6]));
  });
});
