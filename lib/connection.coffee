EventEmitter = require('events').EventEmitter
PreloginPacket = require('./packet-prelogin').PreloginPacket
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
    #console.log(@connection)

    @startRequest('connect/login', callback);

  eventClose: (hadError) =>
    console.log('close', hadError)

  eventConnect: =>
    console.log('connect')
    @sendPreLoginPacket()
    @activeRequest.callback(undefined, true)

  eventData: (data) =>
    console.log('data', data)

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
      log(packet.dataToString('  '))
    )

  debug: (debugFunction) =>
    if @listeners('debug').length > 0
      debugFunction((text) =>
        if !@closed
          @emit('debug', text)
      )

module.exports = Connection
