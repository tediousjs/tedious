TrackingBuffer = require('../../../src/tracking-buffer/readable-tracking-buffer-cb')

exports.createNoArgs = (test) ->
  buffer = new TrackingBuffer()

  test.strictEqual(buffer.buffer.length, 0)

  test.done()

exports.createWithBuffer = (test) ->
  inputBuffer = new Buffer([1 ,2, 3])
  buffer = new TrackingBuffer(inputBuffer)

  test.strictEqual(buffer.buffer, inputBuffer)
  test.done()

exports.notEnoughData = (test) ->
  buffer = new TrackingBuffer(new Buffer([0x12]))
  buffer.readUInt16LE((value) ->
    test.ok(false, 'callback should not be called')
  )

  test.done()

exports.notEnoughDataInitiallyThenSatisfiedWithOneAdd = (test) ->
  buffer = new TrackingBuffer(new Buffer([0x12]))
  buffer.readUInt16LE((value) ->
    test.strictEqual(value, 0x3412)
    test.done()
  )
  buffer.add(new Buffer([0x34]))

exports.notEnoughDataInitiallyThenSatisfiedWithMultipleAdds = (test) ->
  test.expect(3)

  done = false
  data = new Buffer([0x12, 0x34, 0x56, 0x78]);

  buffer = new TrackingBuffer()
  buffer.readBuffer(data.length, (value) ->
    test.ok(value.equals(data), 'buffer value')
    done = true
    test.done()
  )
  buffer.add(data.slice(0, 1))
  test.ok(!done, 'not enough data yet')
  buffer.add(data.slice(1, 2))
  test.ok(!done, 'not enough data yet')
  buffer.add(data.slice(2, 4))

exports.valuesSpanBuffers = (test) ->
  test.expect(3)

  data = new Buffer([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]);

  buffer = new TrackingBuffer()
  buffer.readUInt16LE((value) ->
    test.strictEqual(value, 0x3412)
    buffer.readUInt16LE((value) ->
      test.strictEqual(value, 0x7856)
      buffer.readUInt16LE((value) ->
        test.strictEqual(value, 0xbc9a)
        test.done()
      )
    )
  )
  buffer.add(data.slice(0, 1))
  buffer.add(data.slice(1, 3))
  buffer.add(data.slice(3, 5))
  buffer.add(data.slice(5, 6))

exports.valuesSpanBuffersAlwaysDeferred = (test) ->
  test.expect(3)

  data = new Buffer([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]);

  buffer = new TrackingBuffer()
  buffer.readUInt16LE((value) ->
    test.strictEqual(value, 0x3412)

    buffer.readUInt16LE((value) ->
      test.strictEqual(value, 0x7856)

      buffer.readUInt16LE((value) ->
        test.strictEqual(value, 0xbc9a)
        test.done()
      )
      buffer.add(data.slice(5, 6))
    )
    buffer.add(data.slice(3, 5))
  )
  buffer.add(data.slice(0, 1))
  buffer.add(data.slice(1, 3))

exports.readUInt16LE = (test) ->
  test.expect(1)

  buffer = new TrackingBuffer(new Buffer([0x12, 0x34]))
  buffer.readUInt16LE((value) ->
    test.strictEqual(value, 0x3412)
    test.done()
  )

exports.readBuffer = (test) ->
  test.expect(1)

  data = new Buffer([0x12, 0x34, 0x56, 0x78]);

  buffer = new TrackingBuffer(data)
  buffer.readBuffer(data.length, (value) ->
    test.ok(value.equals(data), 'buffer value')
    test.done()
  )
