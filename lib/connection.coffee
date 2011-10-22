Debug = require('./debug')
EventEmitter = require('events').EventEmitter
TYPE = require('./packet').TYPE
PreloginPayload = require('./prelogin-payload')
Login7Payload = require('./login7-payload')
MessageIO = require('./message-io')
Socket = require('net').Socket

STATE =
  SENT_PRELOGIN: 1,
  SENT_LOGIN7: 2,


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
    switch @state
      when STATE.SENT_PRELOGIN
        preloginPayload = new PreloginPayload(payload)
        @debug.payload(preloginPayload.toString('  '))

        @sendLogin7Packet()

      when STATE.SENT_LOGIN7
        console.log('LOGIN7 response')
        console.log(payload)
        @activeRequest.callback(undefined, true)

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
    @state = STATE.SENT_PRELOGIN

  sendLogin7Packet: ->
    loginData =
      userName: @userName,
      password: @password,
      database: @options.database

    payload = new Login7Payload(loginData)
    @messageIo.sendMessage(TYPE.LOGIN7, payload.data)
    @debug.payload(payload.toString('  '))
    @state = STATE.SENT_LOGIN7

module.exports = Connection
