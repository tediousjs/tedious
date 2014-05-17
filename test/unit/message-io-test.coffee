Debug = require('../../src/debug')
EventEmitter = require('events').EventEmitter
require('../../src/buffertools')
MessageIO = require('../../src/message-io')
Packet = require('../../src/packet').Packet
require('../../src/buffertools')

assert = require("chai").assert

class Connection extends EventEmitter
  setTimeout: ->

  connect: ->

  write: (data) ->
    packet = new Packet(data)
    @emit('packet', packet)

packetType = 2
packetSize = 8 + 4

describe "MessageIO", ->
  beforeEach ->
    @connection = new Connection
    @io = new MessageIO(@connection, packetSize, new Debug())

  describe "#sendMessage", ->
    it "writes payloads that fit into a single packet directly to the Connection", ->
      packets = []
      @connection.on('packet', (packet) -> packets.push(packet))

      payload = new Buffer([1, 2, 3])
      @io.sendMessage(packetType, payload)

      assert.lengthOf(packets, 1)
      assert.isTrue(packets[0].last())
      assert.strictEqual(packets[0].type(), packetType)
      assert.deepEqual(packets[0].data(), payload)

    it "writes payloads that fit exactly into a single packet directly to the Connection", ->
      packets = []
      @connection.on('packet', (packet) -> packets.push(packet))

      payload = new Buffer([1, 2, 3, 4])
      @io.sendMessage(packetType, payload)

      assert.lengthOf(packets, 1)
      assert.isTrue(packets[0].last())
      assert.strictEqual(packets[0].type(), packetType)
      assert.deepEqual(packets[0].data(), payload)

    it "splits up payloads that do not fit into a single packet", ->
      packets = []
      @connection.on('packet', (packet) -> packets.push(packet))

      payload = new Buffer([1, 2, 3, 4, 5])
      @io.sendMessage(packetType, payload)

      assert.lengthOf(packets, 2)
      assert.isFalse(packets[0].last())
      assert.strictEqual(packets[0].type(), packetType)
      assert.deepEqual(packets[0].data(), new Buffer([1, 2, 3, 4]))

      assert.isTrue(packets[1].last())
      assert.strictEqual(packets[1].type(), packetType)
      assert.deepEqual(packets[1].data(), new Buffer([5]))

  describe "when the underlying Connection emits 'data' events", ->
    it "emits 'data' and 'message' events", (done) ->
      payload = new Buffer([1, 2, 3])

      receivedData = []
      @io.on('data', (data) -> receivedData.push(data))
      @io.on('message', ->
        assert.deepEqual(Buffer.concat(receivedData), payload)
        done()
      )

      packet = new Packet(packetType)
      packet.last(true)
      packet.addData(payload)
      @connection.emit('data', packet.buffer)

    it "can correctly handle a packet split over multiple chunks", (done) ->
      payload = new Buffer([1, 2, 3])

      receivedData = []
      @io.on('data', (data) -> receivedData.push(data))
      @io.on('message', ->
        assert.deepEqual(Buffer.concat(receivedData), payload)
        done()
      )

      packet = new Packet(packetType)
      packet.last(true)
      packet.addData(payload)

      @connection.emit('data', packet.buffer.slice(0, 4))
      @connection.emit('data', packet.buffer.slice(4))

    it "can correctly handle a message split over multiple packets", (done) ->
      payload1 = new Buffer([1, 2])
      payload2 = new Buffer([3])

      receivedData = []
      @io.on('data', (data) -> receivedData.push(data))
      @io.on('message', ->
        assert.deepEqual(
          Buffer.concat(receivedData),
          Buffer.concat([payload1, payload2])
        )
        done()
      )

      packet = new Packet(packetType)
      packet.addData(payload1)
      @connection.emit('data', packet.buffer)

      packet = new Packet(packetType)
      packet.last(true)
      packet.addData(payload2)
      @connection.emit('data', packet.buffer)

    it "can correctly handle chunks spanning two different packets", (done) ->
      payload1 = new Buffer([1, 2])
      payload2 = new Buffer([3, 4])

      receivedData = []
      @io.on('data', (data) -> receivedData.push(data))
      @io.on('message', ->
        assert.deepEqual(
          Buffer.concat(receivedData),
          Buffer.concat([payload1, payload2])
        )
        done()
      )

      packet1 = new Packet(packetType)
      packet1.addData(payload1)

      packet2 = new Packet(packetType)
      packet2.last(true)
      packet2.addData(payload2)

      @connection.emit('data', packet1.buffer.slice(0, 6))
      @connection.emit('data', Buffer.concat([packet1.buffer.slice(6), packet2.buffer.slice(0, 4)]))
      @connection.emit('data', packet2.buffer.slice(4))

    it "can correctly handle chunks spanning more than two different packets", (done) ->
      payload1 = new Buffer([1, 2])
      payload2 = new Buffer([3, 4])
      payload3 = new Buffer([5, 6])

      receivedData = []
      @io.on('data', (data) -> receivedData.push(data))
      @io.on('message', ->
        assert.deepEqual(
          Buffer.concat(receivedData),
          Buffer.concat([payload1, payload2, payload3])
        )
        done()
      )

      packet1 = new Packet(packetType)
      packet1.addData(payload1)
      
      packet2 = new Packet(packetType)
      packet2.addData(payload2)

      packet3 = new Packet(packetType)
      packet3.last(true)
      packet3.addData(payload3)

      allData = Buffer.concat([packet1.buffer, packet2.buffer, packet3.buffer])
      data1 = allData.slice(0, 5)
      data2 = allData.slice(5)

      @connection.emit('data', data1)
      @connection.emit('data', data2)
