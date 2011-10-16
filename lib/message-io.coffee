EventEmitter = require('events').EventEmitter
isPacketComplete = require('./packet').isPacketComplete
Packet = require('./packet').Packet

DEFAULT_PACKET_SIZE = 4 * 1024

class MessageIO extends EventEmitter
  constructor: (@connection, timeout, @debug) ->
    @_packetSize = DEFAULT_PACKET_SIZE

    @connection.setTimeout(timeout)
    @connection.connect(@port, @server)

    @connection.addListener('close', @eventClose)
    @connection.addListener('connect', @eventConnect)
    @connection.addListener('data', @eventData)
    @connection.addListener('end', @eventEnd)
    @connection.addListener('error', @eventError)
    @connection.addListener('timeout', @eventTimeout)

    @packetBuffer = new Buffer(0)
    @payloadBuffer = new Buffer(0)

  eventClose: (hadError) =>
    @debug.log('close', hadError)

  eventConnect: =>
    @debug.log("connected to #{@server}:#{@port}")

  eventData: (data) =>
    @packetBuffer = new Buffer(@packetBuffer.concat(data))

    if isPacketComplete(@packetBuffer)
      packet = new Packet(@packetBuffer)
      @logPacket('Received', packet);

      @addToMessage(packet)
      @packetBuffer = new Buffer(0)

  eventEnd: =>
    @debug.log('end')

  eventError: (exception) =>
    @debug.log('error', exception)

  eventTimeout: =>
    @debug.log('timeout')
    @connection.end()

  packetSize: (packetSize) ->
    if arguments.length > 0
      @_packetSize = packetSize

    @_packetSize

  addToMessage: (packet) ->
    @payloadBuffer = new Buffer(@payloadBuffer.concat(packet.data()))

    if packet.isLast()
      @emit('message', packet.type(), @payloadBuffer)
      @payloadBuffer = new Buffer(0)

  sendMessage: (packetType, payload) ->
    numberOfPackets = (Math.floor((payload.length - 1) / @_packetSize)) + 1

    for packetNumber in [0..numberOfPackets - 1]
      payloadStart = packetNumber * @_packetSize
      if packetNumber < numberOfPackets - 1
        payloadEnd = payloadStart + @_packetSize
      else
        payloadEnd = payload.length
      packetPayload = payload.slice(payloadStart, payloadEnd)

      packet = new Packet(packetType)
      packet.last(packetNumber == numberOfPackets - 1)
      packet.packetId(packetNumber)
      packet.addData(packetPayload)

      @sendPacket(packet)

  sendPacket: (packet) =>
    @logPacket('Sent', packet);
    @connection.write(packet.buffer)

  logPacket: (direction, packet) ->
    @debug.packet(direction, packet)
    @debug.data(packet)

module.exports = MessageIO
