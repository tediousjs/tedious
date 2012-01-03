require('./buffertools')
EventEmitter = require('events').EventEmitter
isPacketComplete = require('./packet').isPacketComplete
packetLength = require('./packet').packetLength
Packet = require('./packet').Packet

class MessageIO extends EventEmitter
  constructor: (@socket, @packetSize, @debug) ->
    @socket.addListener('data', @eventData)

    @packetBuffer = new Buffer(0)
    @payloadBuffer = new Buffer(0)

  eventData: (data) =>
    @packetBuffer = new Buffer(@packetBuffer.concat(data))

    while isPacketComplete(@packetBuffer)
      length = packetLength(@packetBuffer)
      packet = new Packet(@packetBuffer.slice(0, length))
      @logPacket('Received', packet);

      @emit('packet', packet)
      if (packet.isLast())
        @emit('message')

      @packetBuffer = new Buffer(@packetBuffer.slice(length))

  packetSize: (packetSize) ->
    if arguments.length > 0
      @debug.log("Packet size changed from #{@packetSize} to #{packetSize}")
      @packetSize = packetSize

    @_packetSize

  # TODO listen for 'drain' event when socket.write returns false.
  sendMessage: (packetType, data) ->
    numberOfPackets = (Math.floor((data.length - 1) / @packetSize)) + 1

    for packetNumber in [0..numberOfPackets - 1]
      payloadStart = packetNumber * @packetSize
      if packetNumber < numberOfPackets - 1
        payloadEnd = payloadStart + @packetSize
      else
        payloadEnd = data.length
      packetPayload = data.slice(payloadStart, payloadEnd)

      packet = new Packet(packetType)
      packet.last(packetNumber == numberOfPackets - 1)
      packet.packetId(packetNumber)
      packet.addData(packetPayload)

      @sendPacket(packet)

  sendPacket: (packet) =>
    @logPacket('Sent', packet);
    @socket.write(packet.buffer)

  logPacket: (direction, packet) ->
    @debug.packet(direction, packet)
    @debug.data(packet)

module.exports = MessageIO
