EventEmitter = require('events').EventEmitter
Packet = require('./packet').Packet
PreloginPacket = require('./packet-prelogin').PreloginPacket
packetFromBuffer = require('./packet-util').packetFromBuffer
isPacketComplete = require('./packet').isPacketComplete
Socket = require('net').Socket

class Connection extends EventEmitter
  constructor: (@server, @userName, @password, @options, callback) ->
    @options.port |= 1433

    @connection = new Socket({})
    @connection.setTimeout(1000)
    @connection.connect(@options.port, @server)

    @connection.addListener('close', @eventClose)
    @connection.addListener('connect', @eventConnect)
    @connection.addListener('data', @eventData)
    @connection.addListener('end', @eventEnd)
    @connection.addListener('error', @eventError)
    @connection.addListener('timeout', @eventTimeout)

    @startRequest('connect/login', callback);

    @packetBuffer = new Buffer(0)

  eventClose: (hadError) =>
    console.log('close', hadError)

  eventConnect: =>
    console.log('connect')
    @sendPreLoginPacket()
    @activeRequest.callback(undefined, true)

  eventData: (data) =>
    @packetBuffer = new Buffer(@packetBuffer.concat(data))

    if isPacketComplete(@packetBuffer)
      packet = packetFromBuffer(@packetBuffer)
      @logPacket('Received', packet);

      @packetBuffer = new Buffer(0)

  eventEnd: =>
    console.log('end')

  eventError: (exception) =>
    console.log('error', exception)

  eventTimeout: =>
    console.log('timeout')
    @connection.end()

  startRequest: (requestName, callback) =>
    @activeRequest =
      requestName: requestName
      info:
        infos: []
        errors: []
        envChanges: []
      callback: callback

  sendPreLoginPacket: ->
    packet = new PreloginPacket()
    packet.last(true)
    
    @sendPacket(packet)
    #@state = STATE.SENT_PRELOGIN

  sendPacket: (packet) =>
    @logPacket('Sent', packet);
    @connection.write(packet.buffer)

  logPacket: (text, packet) ->
    @debug((log) ->
      log(text + ' packet')
      
      log(packet.headerToString('  '))
      log('')
      log(packet.dataToString('  '))
      log('')
      log(packet.payloadString('  '))
    )

  debug: (debugFunction) =>
    if @listeners('debug').length > 0
      debugFunction((text) =>
        if !@closed
          @emit('debug', text)
      )

module.exports = Connection
