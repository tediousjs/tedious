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

exports.notEnoughDataInitially = (test) ->
  buffer = new TrackingBuffer(new Buffer([0x12]))
  buffer.readUInt16LE((value) ->
    test.strictEqual(value, 0x3412)
    test.done()
  )
  buffer.add(new Buffer([0x34]))

exports.notEnoughDataInitiallySatisfiedWithMultipleAdds = (test) ->
  done= false

  buffer = new TrackingBuffer(new Buffer([]))
  buffer.readUInt16LE((value) ->
    test.strictEqual(value, 0x3412)
    done = true
    test.done()
  )
  buffer.add(new Buffer([0x12]))
  test.ok(!done, 'not enough data yet')
  buffer.add(new Buffer([0x34]))

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
  buffer.readBuffer(4, (value) ->
    test.ok(value.equals(data), 'buffer value')
    test.done()
  )
