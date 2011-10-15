Debug = require('./debug')
EventEmitter = require('events').EventEmitter
Packet = require('./packet').Packet
TYPE = require('./packet').TYPE
PreloginPayload = require('./payload-prelogin').PreloginPayload
isPacketComplete = require('./packet').isPacketComplete
Socket = require('net').Socket

class Connection extends EventEmitter
  constructor: (@server, @userName, @password, @options, callback) ->
    @options ||= {}
    @options.port ||= 1433

    @debug = new Debug(@, ->
      !@closed
    , @options.debug)

    @closed = false

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
      packet = new Packet(@packetBuffer)
      @logPacket('Received', packet);

      preloginPayload = new PreloginPayload(packet.data())
      @debug.payload(preloginPayload.toString('  '))

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
    #packet = new PreloginPacket()
    preloginPayload = new PreloginPayload()
    packet = new Packet(TYPE.PRELOGIN)
    packet.addData(preloginPayload.data)
    packet.last(true)
    
    @sendPacket(packet)
    @debug.payload(preloginPayload.toString('  '))
    #@state = STATE.SENT_PRELOGIN

  sendPacket: (packet) =>
    @logPacket('Sent', packet);
    @connection.write(packet.buffer)

  logPacket: (direction, packet) ->
    @debug.packet(direction, packet)
    @debug.data(packet)

module.exports = Connection
