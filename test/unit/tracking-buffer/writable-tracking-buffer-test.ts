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
});

describe('Writable Tracking Buffer list API', function() {
  it('starts out empty', function() {
    const list = new WritableTrackingBuffer();
    assert.strictEqual(list.length, 0);
    assert.deepEqual(list.getBuffers(), []);
    assert.deepEqual(list.slice(), Buffer.alloc(0));
  });

  it('returns stable data across later writes', function() {
    const list = new WritableTrackingBuffer();
    list.writeUInt8(1);
    list.writeUInt8(2);

    const first = list.data;
    list.writeUInt8(3);
    list.append(Buffer.alloc(CHUNK_SIZE, 4));
    list.writeUInt8(5);

    assert.deepEqual(first, Buffer.from([1, 2]));
    assert.strictEqual(list.data.length, 3 + CHUNK_SIZE + 1);
    assert.deepEqual(list.data.subarray(0, 3), Buffer.from([1, 2, 3]));
    assert.strictEqual(list.data[3 + CHUNK_SIZE], 5);
  });

  it('coalesces small appended buffers into a single chunk', function() {
    const list = new WritableTrackingBuffer();
    list.append(Buffer.from([1, 2]));
    list.append(Buffer.from([3]));
    list.append([Buffer.from([4]), Buffer.from([5, 6])]);

    assert.strictEqual(list.length, 6);
    const buffers = list.getBuffers();
    assert.lengthOf(buffers, 1);
    assert.deepEqual(buffers[0], Buffer.from([1, 2, 3, 4, 5, 6]));
  });

  it('references large buffers instead of copying them', function() {
    const list = new WritableTrackingBuffer();
    const large = Buffer.alloc(CHUNK_SIZE, 0x42);
    list.append(Buffer.from([1]));
    list.append(large);
    list.append(Buffer.from([2]));

    const buffers = list.getBuffers();
    assert.lengthOf(buffers, 3);
    assert.deepEqual(buffers[0], Buffer.from([1]));
    assert.strictEqual(buffers[1], large);
    assert.deepEqual(buffers[2], Buffer.from([2]));
    assert.strictEqual(list.length, CHUNK_SIZE + 2);
  });

  it('never produces coalesced chunks larger than the chunk size', function() {
    const list = new WritableTrackingBuffer();
    const piece = Buffer.alloc(1000, 0x01);
    for (let i = 0; i < 100; i++) {
      list.append(piece);
    }

    const buffers = list.getBuffers();
    assert.isAbove(buffers.length, 1);
    for (const buffer of buffers) {
      assert.isAtMost(buffer.length, CHUNK_SIZE);
    }
    assert.deepEqual(list.slice(), Buffer.alloc(100 * 1000, 0x01));
  });

  it('encodes strings', function() {
    const list = new WritableTrackingBuffer();
    list.append('héllo 🎉', 'ucs2');
    list.append('héllo 🎉', 'utf8');
    list.append('x'.repeat(100), 'ucs2');

    const expected = Buffer.concat([
      Buffer.from('héllo 🎉', 'ucs2'),
      Buffer.from('héllo 🎉', 'utf8'),
      Buffer.from('x'.repeat(100), 'ucs2')
    ]);
    assert.deepEqual(list.slice(), expected);
    assert.strictEqual(list.length, expected.length);
  });

  it('writes fixed-width values', function() {
    const list = new WritableTrackingBuffer();
    list.writeUInt8(0xFF);
    list.writeInt8(-1);
    list.writeUInt16LE(0x1234);
    list.writeInt16LE(-2);
    list.writeUInt32LE(0xDEADBEEF);
    list.writeInt32LE(-3);
    list.writeBigUInt64LE(0xFFFFFFFFFFFFFFFFn);
    list.writeBigInt64LE(-4n);
    list.writeFloatLE(1.5);
    list.writeDoubleLE(-2.25);

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

    assert.deepEqual(list.slice(), expected);
    assert.strictEqual(list.length, expected.length);
  });

  it('keeps writes contiguous across chunk boundaries', function() {
    const list = new WritableTrackingBuffer();
    // Fill up to just below the first chunk boundary, then write a value
    // that does not fit into the remaining space.
    list.append(Buffer.alloc(1023, 0x00));
    list.writeUInt32LE(0x01020304);

    const data = list.slice();
    assert.strictEqual(data.readUInt32LE(1023), 0x01020304);
    for (const buffer of list.getBuffers()) {
      assert.isAtMost(buffer.length, CHUNK_SIZE);
    }
  });

  it('consumes bytes from the front', function() {
    const list = new WritableTrackingBuffer();
    list.append(Buffer.from([1, 2, 3, 4, 5]));

    const before = list.getBuffers();
    list.consume(2);
    assert.strictEqual(list.length, 3);
    assert.deepEqual(list.slice(), Buffer.from([3, 4, 5]));

    // a previously returned list of buffers is unaffected
    assert.deepEqual(before, [Buffer.from([1, 2, 3, 4, 5])]);

    list.consume(3);
    assert.strictEqual(list.length, 0);
    assert.deepEqual(list.getBuffers(), []);

    list.append(Buffer.from([6]));
    assert.deepEqual(list.slice(), Buffer.from([6]));
  });

  it('consumes across chunks', function() {
    const list = new WritableTrackingBuffer();
    const large = Buffer.alloc(CHUNK_SIZE, 0x42);
    list.append(Buffer.from([1, 2]));
    list.append(large);
    list.append(Buffer.from([3]));

    list.consume(2 + CHUNK_SIZE - 1);
    assert.strictEqual(list.length, 2);
    assert.deepEqual(list.slice(), Buffer.from([0x42, 3]));
  });

  it('slices ranges', function() {
    const list = new WritableTrackingBuffer();
    list.append(Buffer.from([1, 2, 3]));
    list.append(Buffer.alloc(CHUNK_SIZE, 4));
    list.append(Buffer.from([5, 6]));

    assert.deepEqual(list.slice(1, 3), Buffer.from([2, 3]));
    assert.deepEqual(list.slice(2, 5), Buffer.from([3, 4, 4]));
    assert.deepEqual(list.slice(CHUNK_SIZE + 2), Buffer.from([4, 5, 6]));
  });
});
