tls = require('tls')
crypto = require('crypto')

require('./buffertools')
EventEmitter = require('events').EventEmitter
isPacketComplete = require('./packet').isPacketComplete
packetLength = require('./packet').packetLength
packetHeaderLength = require('./packet').HEADER_LENGTH
Packet = require('./packet').Packet
TYPE = require('./packet').TYPE

StreamParser = require('./stream-parser')

class ReadablePacketStream extends StreamParser
  constructor: ->
    super()

  parser: ->
    while true
      header = yield @readBuffer(packetHeaderLength)
      length = header.readUInt16BE(2)
      data = yield @readBuffer(length - packetHeaderLength)

      @push(new Packet(Buffer.concat([header, data])))

    undefined

class MessageIO extends EventEmitter
  constructor: (@socket, @_packetSize, @debug) ->
    @packetStream = new ReadablePacketStream()
    @packetStream.on 'data', (packet) =>
      @logPacket('Received', packet)
      @emit 'data', packet.data()
      @emit 'message' if packet.isLast()

    @socket.pipe(@packetStream)

    @packetDataSize = @_packetSize - packetHeaderLength

  packetSize: (packetSize) ->
    if arguments.length > 0
      @debug.log("Packet size changed from #{@_packetSize} to #{packetSize}")
      @_packetSize = packetSize
      @packetDataSize = @_packetSize - packetHeaderLength

    @_packetSize

  startTls: (credentialsDetails) ->
    credentials = if tls.createSecureContext
      tls.createSecureContext(credentialsDetails)
    else
      crypto.createCredentials(credentialsDetails)

    @securePair = tls.createSecurePair(credentials)
    @tlsNegotiationComplete = false

    @securePair.on 'secure', =>
      cipher = @securePair.cleartext.getCipher()
      @debug.log("TLS negotiated (#{cipher.name}, #{cipher.version})")

      @emit('secure', @securePair.cleartext)
      @encryptAllFutureTraffic()

    @securePair.encrypted.on 'data', (data) =>
      @sendMessage(TYPE.PRELOGIN, data)

    # On Node >= 0.12, the encrypted stream automatically starts spewing out
    # data once we attach a `data` listener. But on Node <= 0.10.x, this is not
    # the case. We need to kick the cleartext stream once to get the
    # encrypted end of the secure pair to emit the TLS handshake data.
    @securePair.cleartext.write('')

  encryptAllFutureTraffic: () ->
    @socket.unpipe(@packetStream)
    @securePair.encrypted.removeAllListeners('data')

    @socket.pipe(@securePair.encrypted)
    @securePair.encrypted.pipe(@socket)

    @securePair.cleartext.pipe(@packetStream)

    @tlsNegotiationComplete = true

  tlsHandshakeData: (data) ->
    @securePair.encrypted.write(data)

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

    if @securePair && @tlsNegotiationComplete
      @securePair.cleartext.write(packet.buffer)
    else
      @socket.write(packet.buffer)

  logPacket: (direction, packet) ->
    @debug.packet(direction, packet)
    @debug.data(packet)

module.exports = MessageIO
