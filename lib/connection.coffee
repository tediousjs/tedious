Debug = require('./debug')
EventEmitter = require('events').EventEmitter
TYPE = require('./packet').TYPE
PreloginPayload = require('./prelogin-payload').PreloginPayload
MessageIO = require('./message-io')
Socket = require('net').Socket

class Connection extends EventEmitter
  constructor: (@server, @userName, @password, @options, callback) ->
    @options ||= {}
    @options.port ||= 1433
    @options.timeout ||= 10 * 1000

    @debug = new Debug(@options.debug)
    @debug.on('debug', (message) =>
      if !@closed
        @emit('debug', message)
    )

    @closed = false

    @connection = new Socket({})
    @connection.setTimeout(options.timeout)
    @connection.connect(@options.port, @server)

    @connection.addListener('close', @eventClose)
    @connection.addListener('connect', @eventConnect)
    @connection.addListener('end', @eventEnd)
    @connection.addListener('error', @eventError)
    @connection.addListener('timeout', @eventTimeout)

    @messageIo = new MessageIO(@connection, @debug)
    @messageIo.on('message', @eventMessage)

    @startRequest('connect/login', callback);

    @packetBuffer = new Buffer(0)

  eventClose: (hadError) =>
    console.log('close', hadError)

  eventConnect: =>
    console.log('connect')
    @sendPreLoginPacket()
    @activeRequest.callback(undefined, true)

  eventEnd: =>
    console.log('end')

  eventError: (exception) =>
    @debug.log(exception)
    @emit('fatal', exception)
    @connection.destroy()

  eventTimeout: =>
    @debug.log('timeout')
    @emit('fatal', 'timeout')
    @connection.destroy()

  eventMessage: (type, payload) =>
      preloginPayload = new PreloginPayload(payload)
      @debug.payload(preloginPayload.toString('  '))

  startRequest: (requestName, callback) =>
    @activeRequest =
      requestName: requestName
      info:
        infos: []
        errors: []
        envChanges: []
      callback: callback

  sendPreLoginPacket: ->
    payload = new PreloginPayload()
    @messageIo.sendMessage(TYPE.PRELOGIN, payload.data)
    #@state = STATE.SENT_PRELOGIN

module.exports = Connection
