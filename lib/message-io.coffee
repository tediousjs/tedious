require('buffertools')
EventEmitter = require('events').EventEmitter
isPacketComplete = require('./packet').isPacketComplete
packetLength = require('./packet').packetLength
Packet = require('./packet').Packet

DEFAULT_PACKET_SIZE = 4 * 1024

class MessageIO extends EventEmitter
  constructor: (@connection, @debug) ->
    @_packetSize = DEFAULT_PACKET_SIZE

    @connection.addListener('data', @eventData)

    @packetBuffer = new Buffer(0)
    @payloadBuffer = new Buffer(0)

  eventData: (data) =>
    @packetBuffer = new Buffer(@packetBuffer.concat(data))

    while isPacketComplete(@packetBuffer)
      length = packetLength(@packetBuffer)
      packet = new Packet(@packetBuffer.slice(0, length))
      @logPacket('Received', packet);

      @emit('packet', packet)
      @packetBuffer = new Buffer(@packetBuffer.slice(length))

  packetSize: (packetSize) ->
    if arguments.length > 0
      @debug.log("Packet size changed from #{@_packetSize} to #{packetSize}")
      @_packetSize = packetSize

    @_packetSize

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
