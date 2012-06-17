require('./buffertools')
EventEmitter = require('events').EventEmitter
decodePacketHeader = require('./packet').decodeHeader
encodePacketHeader = require('./packet').encodeHeader
packetHeaderLength = require('./packet').HEADER_LENGTH
PACKET_STATUS = require('./packet').STATUS

class MessageIO extends EventEmitter
  constructor: (@socket, @readableBuffer, @_packetSize, @debug) ->
    @socket.addListener('data', @eventData)

    @packetDataSize = @_packetSize - packetHeaderLength

    @receivedBuffers = []
    @receivedAvailable = 0

  eventData: (data) =>
    @receivedBuffers.push(data)
    @receivedAvailable += data.length

    while @receivedAvailable >= packetHeaderLength
      @collapseReceivedBuffers(packetHeaderLength)
      header = decodePacketHeader(@receivedBuffers[0])
      if (@receivedAvailable < header.length)
        break
      @advanceReceived(packetHeaderLength)

      @processReceivedPacket(header.payloadLength)

      if header.endOfMessage
        @emit('message')

  collapseReceivedBuffers: (requiredLength) ->
    while @receivedBuffers[0].length < requiredLength
      @receivedBuffers[1] = @receivedBuffers[0].concat(@receivedBuffers[1])
      @receivedBuffers.shift()

  advanceReceived: (length) ->
    @receivedAvailable -= length

    while length
      if length >= @receivedBuffers[0].length
        length -= @receivedBuffers[0]
        @receivedBuffers.shift()
      else
        @receivedBuffers[0] = @receivedBuffers[0].slice(length)
        length = 0

  processReceivedPacket: (length) ->
    @receivedAvailable -= length

    while length
      if length >= @receivedBuffers[0].length
        length -= @receivedBuffers[0]
        buffer = @receivedBuffers[0]
        @receivedBuffers.shift()
      else
        buffer = @receivedBuffers[0].slice(0, length)
        @receivedBuffers[0] = @receivedBuffers[0].slice(length)
        length = 0

      @readableBuffer.add(buffer)

  packetSize: (packetSize) ->
    if arguments.length > 0
      @debug.log("Packet size changed from #{@_packetSize} to #{packetSize}")
      @_packetSize = packetSize
      @packetDataSize = @_packetSize - packetHeaderLength

    @_packetSize

  # TODO listen for 'drain' event when socket.write returns false.
  sendMessage: (packetType, data) ->
    numberOfPackets = (Math.floor((data.length - 1) / @packetDataSize)) + 1

    for packetNumber in [0..numberOfPackets - 1]
      payloadStart = packetNumber * @packetDataSize
      if packetNumber < numberOfPackets - 1
        payloadEnd = payloadStart + @packetDataSize
      else
        payloadEnd = data.length
      packetPayload = data.slice(payloadStart, payloadEnd)

      status = PACKET_STATUS.NORMAL
      if packetNumber == numberOfPackets - 1
        status |= PACKET_STATUS.EOM

      packetId = packetNumber + 1

      header = encodePacketHeader(packetType, status, packetPayload.length, packetId)

      @sendPacket(header, packetPayload)

  sendPacket: (header, payload) =>
    #@logPacket('Sent', packet);
    @socket.write(header.concat(payload))

  logPacket: (direction, packet) ->
    @debug.packet(direction, packet)
    @debug.data(packet)

module.exports = MessageIO
