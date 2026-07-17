import { assert } from 'chai';

import { NotEnoughDataError, readBigInt64LE, readUInt8, readUInt16LE, readUInt32LE, readUsVarChar } from '../../../src/token/helpers';

function assertThrowsNotEnoughDataError(fn: () => void, expectedByteCount: number) {
  try {
    fn();
  } catch (err) {
    assert.instanceOf(err, NotEnoughDataError);
    assert.strictEqual((err as NotEnoughDataError).byteCount, expectedByteCount);
    return;
  }

  assert.fail('expected a NotEnoughDataError to be thrown');
}

describe('NotEnoughDataError', function() {
  it('should carry the number of bytes needed to retry the read', function() {
    const err = new NotEnoughDataError(42);

    assert.strictEqual(err.byteCount, 42);
  });

  it('should be thrown by read helpers when the buffer is too short', function() {
    const buf = Buffer.from([0x01, 0x02]);

    assertThrowsNotEnoughDataError(() => readUInt8(buf, 2), 3);
    assertThrowsNotEnoughDataError(() => readUInt16LE(buf, 1), 3);
    assertThrowsNotEnoughDataError(() => readUInt32LE(buf, 0), 4);
    assertThrowsNotEnoughDataError(() => readBigInt64LE(buf, 0), 8);
    assertThrowsNotEnoughDataError(() => readUInt32LE(buf, 1), 5);
  });

  it('should be thrown by variable length read helpers when the data is incomplete', function() {
    // A `UsVarChar` with a length prefix of 3 characters, but only 2 characters of data.
    const buf = Buffer.alloc(2 + 4);
    buf.writeUInt16LE(3, 0);
    buf.write('ab', 2, 'ucs2');

    assertThrowsNotEnoughDataError(() => readUsVarChar(buf, 0), 2 + 6);
  });

  it('should not be thrown when the buffer holds enough data', function() {
    const buf = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    const result = readUInt32LE(buf, 0);
    assert.strictEqual(result.value, 0x04030201);
    assert.strictEqual(result.offset, 4);
  });
});
