import { assert } from 'chai';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer as writeAllHeaders } from '../../src/all-headers';

describe('All Headers', function() {
  it('should write headers', function() {
    const expected = Buffer.from([
      0x16,
      0x00,
      0x00,
      0x00,
      0x12,
      0x00,
      0x00,
      0x00,
      0x02,
      0x00,
      0x01,
      0x02,
      0x03,
      0x04,
      0x05,
      0x06,
      0x07,
      0x08,
      0x01,
      0x00,
      0x00,
      0x00
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    const transactionDescriptor = Buffer.from([
      0x01,
      0x02,
      0x03,
      0x04,
      0x05,
      0x06,
      0x07,
      0x08
    ]);
    writeAllHeaders(buffer, transactionDescriptor, 1);

    assert.deepEqual(buffer.data, expected);
  });
});
