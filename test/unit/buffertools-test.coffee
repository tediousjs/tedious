require('../../src/buffertools')

assert = require("chai").assert

describe "Buffer", ->
  describe "#concat", ->
    it "concats all Buffers in the given Array", ->
      buffer = Buffer.concat([
        new Buffer([1, 2]),
        new Buffer([3, 4])
      ])

      assert.deepEqual(buffer, new Buffer([1, 2, 3, 4]))

      buffer = Buffer.concat([
        new Buffer([1, 2]),
        new Buffer([3, 4]),
        new Buffer([5, 6])
      ])

      assert.deepEqual(buffer, new Buffer([1, 2, 3, 4, 5, 6]))

  describe "#toByteArray", ->
    it "returns an Array containing all the bytes of the given Buffer", ->
      assert.deepEqual(new Buffer([1, 2, 3]).toByteArray(), [1, 2, 3])

  describe "#equals", ->
    it "returns true if the other Buffer contains the same bytes", ->
      assert.isTrue(new Buffer([]).equals(new Buffer([])))
      assert.isTrue(new Buffer([1, 2, 3]).equals(new Buffer([1, 2, 3])))

    it "returns false if the other Buffer contains different bytes", ->
      assert.isFalse(new Buffer([1, 2, 3]).equals(new Buffer([])))
      assert.isFalse(new Buffer([]).equals(new Buffer([1, 2, 3])))
      assert.isFalse(new Buffer([1, 2, 3]).equals(new Buffer([1, 2, 9])))
