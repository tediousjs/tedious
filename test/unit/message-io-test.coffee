Debug = require('../../src/debug')
EventEmitter = require('events').EventEmitter
require('../../src/buffertools')
MessageIO = require('../../src/message-io')
Packet = require('../../src/packet').Packet
require('../../src/buffertools')

class Connection extends EventEmitter
  setTimeout: ->

  connect: ->

  write: (data) ->
    packet = new Packet(data)
    @emit('packet', packet)

packetType = 2
packetSize = 8 + 4

exports.sendSmallerThanOnePacket = (test) ->
  payload = new Buffer([1, 2, 3])

  connection = new Connection()
  connection.on('packet', (packet) ->
    test.ok(packet.last())
    test.strictEqual(packet.type(), packetType)
    test.ok(packet.data().equals(payload))

    test.done()
  )

  io = new MessageIO(connection, packetSize, new Debug())
  io.sendMessage(packetType, payload)

exports.sendExactlyPacket = (test) ->
  payload = new Buffer([1, 2, 3, 4])

  connection = new Connection()
  connection.on('packet', (packet) ->
    test.ok(packet.last())
    test.strictEqual(packet.type(), packetType)
    test.ok(packet.data().equals(payload))

    test.done()
  )

  io = new MessageIO(connection, packetSize, new Debug())
  io.sendMessage(packetType, payload)

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

exports.receiveOnePacket = (test) ->
  test.expect(1)

  payload = new Buffer([1, 2, 3])
  connection = new Connection()

  io = new MessageIO(connection, packetSize, new Debug())
  io.on('data', (data) ->
      test.ok(data.equals(payload))
  )
  io.on('message', ->
      test.done()
  )

  packet = new Packet(packetType)
  packet.last(true)
  packet.addData(payload)
  connection.emit('data', packet.buffer)

exports.receiveOnePacketInTwoChunks = (test) ->
  test.expect(1)

  payload = new Buffer([1, 2, 3])
  connection = new Connection()

  io = new MessageIO(connection, packetSize, new Debug())
  io.on('data', (data) ->
    test.ok(data.equals(payload))
  )
  io.on('message', ->
      test.done()
  )

  packet = new Packet(packetType)
  packet.last(true)
  packet.addData(payload)
  connection.emit('data', packet.buffer.slice(0, 4))
  connection.emit('data', packet.buffer.slice(4))

exports.receiveTwoPackets = (test) ->
  test.expect(2)

  payload = new Buffer([1, 2, 3])
  payload1 = payload.slice(0, 2)
  payload2 = payload.slice(2, 3)

  connection = new Connection()
  receivedPacketCount = 0

  io = new MessageIO(connection, packetSize, new Debug())
  io.on('data', (data) ->
    receivedPacketCount++

    switch receivedPacketCount
      when 1
        test.ok(data.equals(payload1))
      when 2
        test.ok(data.equals(payload2))
  )
  io.on('message', ->
      test.done()
  )

  packet = new Packet(packetType)
  packet.addData(payload1)
  connection.emit('data', packet.buffer)

  packet = new Packet(packetType)
  packet.last(true)
  packet.addData(payload2)
  connection.emit('data', packet.buffer)

exports.receiveTwoPacketsWithChunkSpanningPackets = (test) ->
  test.expect(2)

  payload = new Buffer([1, 2, 3, 4])
  payload1 = payload.slice(0, 2)
  payload2 = payload.slice(2, 4)

  connection = new Connection()
  receivedPacketCount = 0

  io = new MessageIO(connection, packetSize, new Debug())
  io.on('data', (data) ->
    receivedPacketCount++

    switch receivedPacketCount
      when 1
        test.ok(data.equals(payload1))
      when 2
        test.ok(data.equals(payload2))
  )
  io.on('message', ->
      test.done()
  )

  packet1 = new Packet(packetType)
  packet1.addData(payload.slice(0, 2))

  packet2 = new Packet(packetType)
  packet2.last(true)
  packet2.addData(payload.slice(2, 4))

  connection.emit('data', packet1.buffer.slice(0, 6))
  connection.emit('data', Buffer.concat([packet1.buffer.slice(6), packet2.buffer.slice(0, 4)]))
  connection.emit('data', packet2.buffer.slice(4))

exports.receiveMultiplePacketsWithMoreThanOnePacketFromOneChunk = (test) ->
  test.expect(1)

  payload = new Buffer([1, 2, 3, 4, 5, 6])
  payload1 = payload.slice(0, 2)
  payload2 = payload.slice(2, 4)
  payload3 = payload.slice(4, 6)

  connection = new Connection()
  receivedData = new Buffer(0)

  io = new MessageIO(connection, packetSize, new Debug())
  io.on('data', (data) ->
    receivedData = Buffer.concat([receivedData, data])
  )

  io.on('message', ->
      test.deepEqual(payload, receivedData)
      test.done()
  )

  packet1 = new Packet(packetType)
  packet1.addData(payload.slice(0, 2))

  packet2 = new Packet(packetType)
  packet2.addData(payload.slice(2, 4))

  packet3 = new Packet(packetType)
  packet3.last(true)
  packet3.addData(payload.slice(4, 6))

  allData = Buffer.concat([packet1.buffer, packet2.buffer, packet3.buffer])
  data1 = allData.slice(0, 5)
  data2 = allData.slice(5)

  connection.emit('data', data1)
  connection.emit('data', data2)
