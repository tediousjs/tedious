WritableTrackingBuffer = require('../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer
require('../../src/buffertools')
writeAllHeaders = require('../../src/all-headers').writeToTrackingBuffer

assert = require("chai").assert

describe "writeToTrackingBuffer", ->
  beforeEach ->
    @buffer = new WritableTrackingBuffer(0, 'ucs2')
    @transactionDescriptor = new Buffer([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])

  it "writes the given transaction descriptor and outstanding request count to the given Buffer", ->
    writeAllHeaders(@buffer, @transactionDescriptor, 1)
    assert.ok(@buffer.data.equals([
      0x16, 0x00, 0x00, 0x00,
      0x12, 0x00, 0x00, 0x00,
      0x02, 0x00,
      0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x01, 0x00, 0x00, 0x00
    ]))

  it "returns the given Buffer", ->
    result = writeAllHeaders(@buffer, @transactionDescriptor, 1)
    assert.strictEqual(@buffer, result)