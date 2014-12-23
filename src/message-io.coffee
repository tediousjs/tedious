require('./buffertools')
EventEmitter = require('events').EventEmitter
isPacketComplete = require('./packet').isPacketComplete
packetLength = require('./packet').packetLength
packetHeaderLength = require('./packet').HEADER_LENGTH
Packet = require('./packet').Packet
TYPE = require('./packet').TYPE

Dissolve = require('dissolve')

class ReadablePacketStream extends Dissolve
  constructor: ->
    super()

    @loop (end) ->
      @uint8("type")
      @uint8("status")
      @uint16be("length")
      @uint16be("spid")
      @uint8("packetId")
      @uint8("window")
      @tap ->
        @buffer("data", @vars.length - packetHeaderLength)
      @tap ->
        @push
          data: @vars.data
          isLast: if @vars.status & 0x01 then -> true else -> false

class MessageIO extends EventEmitter
  constructor: (@socket, @_packetSize, @debug) ->
    @packetStream = new ReadablePacketStream()
    @packetStream.on 'data', (packet) =>
      @emit 'data', packet.data
      @emit 'message' if packet.isLast()

    @socket.pipe(@packetStream)

    @packetDataSize = @_packetSize - packetHeaderLength

  packetSize: (packetSize) ->
    if arguments.length > 0
      @debug.log("Packet size changed from #{@_packetSize} to #{packetSize}")
      @_packetSize = packetSize
      @packetDataSize = @_packetSize - packetHeaderLength

    @_packetSize

  tlsNegotiationStarting: (securePair) ->
    @securePair = securePair
    @tlsNegotiationInProgress = true;

  encryptAllFutureTraffic: () ->
    @socket.unpipe(@packetStream)
    @securePair.encrypted.removeAllListeners('data')

    @socket.pipe(@securePair.encrypted)
    @securePair.encrypted.pipe(@socket)

    @securePair.cleartext.pipe(@packetStream)

    @tlsNegotiationInProgress = false;

  # TODO listen for 'drain' event when socket.write returns false.
  # TODO implement incomplete request cancelation (2.2.1.6)
  sendMessage: (packetType, data, resetConnection) ->
    if data
      numberOfPackets = (Math.floor((data.length - 1) / @packetDataSize)) + 1
    else
      numberOfPackets = 1
      data = new Buffer 0

    for packetNumber in [0..numberOfPackets - 1]
      payloadStart = packetNumber * @packetDataSize
      if packetNumber < numberOfPackets - 1
        payloadEnd = payloadStart + @packetDataSize
      else
        payloadEnd = data.length
      packetPayload = data.slice(payloadStart, payloadEnd)

      packet = new Packet(packetType)
      packet.last(packetNumber == numberOfPackets - 1)
      packet.resetConnection(resetConnection)
      packet.packetId(packetNumber + 1)
      packet.addData(packetPayload)

      @sendPacket(packet, packetType)

  sendPacket: (packet, packetType) =>
    @logPacket('Sent', packet);

    if @tlsNegotiationInProgress && packetType != TYPE.PRELOGIN
      # LOGIN7 packet.
      #   Something written to cleartext stream will initiate TLS handshake.
      #   Will not emerge from the encrypted stream until after negotiation has completed.
      @securePair.cleartext.write(packet.buffer)
    else
      if (@securePair && !@tlsNegotiationInProgress)
        @securePair.cleartext.write(packet.buffer)
      else
        @socket.write(packet.buffer)

  logPacket: (direction, packet) ->
    @debug.packet(direction, packet)
    @debug.data(packet)

module.exports = MessageIO
