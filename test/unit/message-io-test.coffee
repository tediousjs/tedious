Debug = require('../../src/debug')
EventEmitter = require('events').EventEmitter
MessageIO = require('../../src/message-io')
Packet = require('../../src/packet').Packet
decodePacketHeader = require('../../src/packet').decodeHeader
encodePacketHeader = require('../../src/packet').encodeHeader
STATUS = require('../../src/packet').STATUS
require('../../src/buffertools')
ReadableBuffer = require('../../src/tracking-buffer/readable-tracking-buffer')

class Connection extends EventEmitter
  setTimeout: ->

  connect: ->

packetType = 2
packetSize = 8 + 4

exports.sendSmallerThanOnePacket = (test) ->
  test.expect(5)

  buffer = new ReadableBuffer()
  payload = new Buffer([1, 2, 3])

  connection = new Connection()
  connection.write = (data) ->
    header = decodePacketHeader(data.slice(0, 8))
    test.strictEqual(header.type, packetType)
    test.strictEqual(header.length, 8 + 3)
    test.strictEqual(header.status, STATUS.EOM)
    test.strictEqual(header.packetId, 1)

    test.deepEqual(data.slice(8), payload)

    test.done()

  io = new MessageIO(connection, buffer, packetSize, new Debug())
  io.sendMessage(packetType, payload)

exports.sendExactlyOnePacket = (test) ->
  test.expect(5)

  buffer = new ReadableBuffer()
  payload = new Buffer([1, 2, 3, 4])

  connection = new Connection()
  connection.write = (data) ->
    header = decodePacketHeader(data.slice(0, 8))
    test.strictEqual(header.type, packetType)
    test.strictEqual(header.length, 8 + 4)
    test.strictEqual(header.status, STATUS.EOM)
    test.strictEqual(header.packetId, 1)

    test.deepEqual(data.slice(8), payload)

    test.done()

  io = new MessageIO(connection, buffer, packetSize, new Debug())
  io.sendMessage(packetType, payload)

exports.sendOneLongerThanPacket = (test) ->
  test.expect(10)

  buffer = new ReadableBuffer()
  payload = new Buffer([1, 2, 3, 4, 5])
  packetNumber = 0

  connection = new Connection()
  connection.write = (data) ->
    packetNumber++
    header = decodePacketHeader(data.slice(0, 8))

    switch packetNumber
      when 1
        test.strictEqual(header.type, packetType)
        test.strictEqual(header.length, 8 + 4)
        test.strictEqual(header.status, STATUS.NORMAL)
        test.strictEqual(header.packetId, 1)

        test.deepEqual(data.slice(8), payload.slice(0, 4))
      when 2
        test.strictEqual(header.type, packetType)
        test.strictEqual(header.length, 8 + 1)
        test.strictEqual(header.status, STATUS.EOM)
        test.strictEqual(header.packetId, 2)

        test.deepEqual(data.slice(8), payload.slice(4))

        test.done()

  io = new MessageIO(connection, buffer, packetSize, new Debug())
  io.sendMessage(packetType, payload)

###
exports.sendOneLongerThanPacket = (test) ->
  payload = new Buffer([1, 2, 3, 4, 5])
  packetNumber = 0

  connection = new Connection()
  connection.on('packet', (packet) ->
    packetNumber++

    test.strictEqual(packet.type(), packetType)

    switch packetNumber
      when 1
        test.ok(!packet.last())
        test.strictEqual(packet.packetId(), packetNumber)
        test.ok(packet.data().equals(new Buffer([1, 2, 3, 4])))
      when 2
        test.ok(packet.last())
        test.strictEqual(packet.packetId(), packetNumber)
        test.ok(packet.data().equals(new Buffer([5])))

        test.done()
  )

  io = new MessageIO(connection, packetSize, new Debug())
  io.sendMessage(packetType, payload)
###

exports.receiveOnePacket = (test) ->
  test.expect(1)

  payload = new Buffer([1, 2, 3])
  header = encodePacketHeader(packetType, STATUS.EOM, payload.length, 1)
  connection = new Connection()
  buffer = new ReadableBuffer()

  io = new MessageIO(connection, buffer, packetSize, new Debug())
  io.on('message', ->
      test.done()
  )

  buffer.readBuffer(payload.length, (value) ->
    test.deepEqual(value, payload)
  )

  connection.emit('data', header.concat(payload))

exports.receiveOnePacketInTwoChunks = (test) ->
  test.expect(1)

  payload = new Buffer([1, 2, 3])
  header = encodePacketHeader(packetType, STATUS.EOM, payload.length, 1)
  packet = header.concat(payload)

  connection = new Connection()
  buffer = new ReadableBuffer()

  io = new MessageIO(connection, buffer, packetSize, new Debug())
  io.on('message', ->
      test.done()
  )

  buffer.readBuffer(payload.length, (value) ->
    test.deepEqual(value, payload)
  )

  connection.emit('data', packet.slice(0, 4))
  connection.emit('data', packet.slice(4))

exports.receiveTwoPackets = (test) ->
  test.expect(1)

  payload = new Buffer([1, 2, 3, 4, 5, 6])
  header1 = encodePacketHeader(packetType, STATUS.NORMAL, 4, 1)
  header2 = encodePacketHeader(packetType, STATUS.EOM, 2, 1)
  packets = header1.concat(payload.slice(0, 4), header2, payload.slice(4, 6))

  connection = new Connection()
  buffer = new ReadableBuffer()

  io = new MessageIO(connection, buffer, packetSize, new Debug())
  io.on('message', ->
      test.done()
  )

  buffer.readBuffer(payload.length, (value) ->
    test.deepEqual(value, payload)
  )

  connection.emit('data', packets)

exports.receiveTwoPacketsWithChunkSpanningPackets = (test) ->
  test.expect(1)

  payload = new Buffer([1, 2, 3, 4, 5, 6])
  header1 = encodePacketHeader(packetType, STATUS.NORMAL, 4, 1)
  header2 = encodePacketHeader(packetType, STATUS.EOM, 2, 1)
  packets = header1.concat(payload.slice(0, 4), header2, payload.slice(4, 6))

  connection = new Connection()
  buffer = new ReadableBuffer()

  io = new MessageIO(connection, buffer, packetSize, new Debug())
  io.on('message', ->
      test.done()
  )

  buffer.readBuffer(payload.length, (value) ->
    test.deepEqual(value, payload)
  )

  connection.emit('data', packets.slice(0, 3))
  connection.emit('data', packets.slice(3, 14))
  connection.emit('data', packets.slice(14))
