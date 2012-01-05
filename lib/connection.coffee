require('./buffertools')
Debug = require('./debug')
EventEmitter = require('events').EventEmitter
TYPE = require('./packet').TYPE
PreloginPayload = require('./prelogin-payload')
Login7Payload = require('./login7-payload')
SqlBatchPayload = require('./sqlbatch-payload')
MessageIO = require('./message-io')
Socket = require('net').Socket
TokenStreamParser = require('./token/token-stream-parser').Parser

# A rather basic state machine for managing a connection.
# Implements something approximating s3.2.1.

KEEP_ALIVE_INITIAL_DELAY = 30 * 1000
DEFAULT_CONNECT_TIMEOUT = 15 * 1000
DEFAULT_CLIENT_REQUEST_TIMEOUT = 15 * 1000
DEFAULT_CANCEL_TIMEOUT = 5 * 1000
DEFAULT_PACKET_SIZE = 4 * 1024
DEFAULT_PORT = 1433

class Connection extends EventEmitter
  STATE:
    CONNECTING:
      name: 'Connecting'
      enter: ->
        @initialiseConnection()
      events:
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
        connectTimeout: ->
          @transitionTo(@STATE.FINAL)
        socketConnect: ->
          @sendPreLogin()
          @transitionTo(@STATE.SENT_PRELOGIN)

    SENT_PRELOGIN:
      name: 'SentPrelogin'
      enter: ->
        @emptyMessageBuffer()
      events:
        packet: (packet) ->
          @addToMessageBuffer(packet)
        message: ->
          @processPreLoginResponse()
          @sendLogin7Packet()
          @transitionTo(@STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN)
    SENT_LOGIN7_WITH_STANDARD_LOGIN:
      name: 'SentLogin7WithStandardLogin'
      events:
        packet: (packet) ->
          @sendPacketToTokenStreamParser(packet)
        message: ->
          @processLogin7Response()
    LOGGED_IN:
      name: 'LoggedIn'
    SENT_CLIENT_REQUEST:
      name: 'SentClientRequest'
      events:
        packet: (packet) ->
          @sendPacketToTokenStreamParser(packet)
        message: ->
          @sqlRequest.callback(@sqlRequest.error)
          @sqlRequest = undefined
    FINAL:
      name: 'Final'
      enter: ->
        @cleanupConnection()

  constructor: (@config) ->
    @defaultConfig()
    @createDebug()
    @createTokenStreamParser()

    @transitionTo(@STATE.CONNECTING)

  close: ->
    @transitionTo(@STATE.FINAL)

  initialiseConnection: ->
    @connect()
    @createConnectTimer()

  cleanupConnection: ->
    if !@closed
      @clearConnectTimer()
      @closeConnection()
      @emit('end')
      @closed = true

  defaultConfig: ->
    @config.options ||= {}
    @config.options.port ||= DEFAULT_PORT
    @config.options.connectTimeout ||= DEFAULT_CONNECT_TIMEOUT
    @config.options.requestTimeout ||= DEFAULT_CLIENT_REQUEST_TIMEOUT
    @config.options.cancelTimeout ||= DEFAULT_CANCEL_TIMEOUT
    @config.options.packetSize ||= DEFAULT_PACKET_SIZE

  createDebug: ->
    @debug = new Debug(@config.options.debug)
    @debug.on('debug', (message) =>
        @emit('debug', message)
    )

  createTokenStreamParser: ->
    @tokenStreamParser = new TokenStreamParser(@debug)
    @tokenStreamParser.on('infoMessage', (token) =>
      @emit('infoMessage', token)
    )
    @tokenStreamParser.on('errorMessage', (token) =>
      @emit('errorMessage', token)
      if @sqlRequest
        @sqlRequest.error = token.message
    )
    @tokenStreamParser.on('databaseChange', (token) =>
      @emit('databaseChange', token.newValue)
    )
    @tokenStreamParser.on('languageChange', (token) =>
      @emit('languageChange', token.newValue)
    )
    @tokenStreamParser.on('charsetChange', (token) =>
      @emit('charsetChange', token.newValue)
    )
    @tokenStreamParser.on('loginack', (token) =>
      @loggedIn = true
    )
    @tokenStreamParser.on('packetSizeChange', (token) =>
      @messageIo.packetSize(token.newValue)
    )
    @tokenStreamParser.on('columnMetadata', (token) =>
      if @sqlRequest
        @sqlRequest.emit('columnMetadata', token.columns)
      else
        throw new Error("Received 'columnMetadata' when no sqlRequest is in progress")
    )
    @tokenStreamParser.on('row', (token) =>
      if @sqlRequest
        @sqlRequest.emit('row', token.columns)
      else
        throw new Error("Received 'row' when no sqlRequest is in progress")
    )
    @tokenStreamParser.on('returnStatus', (token) =>
      if @sqlRequest
        # Keep value for passing in 'doneProc' event.
        @procReturnStatusValue = token.value
    )
    @tokenStreamParser.on('doneProc', (token) =>
      if @sqlRequest
        @sqlRequest.emit('doneProc', token.rowCount, token.more, @procReturnStatusValue)
        @procReturnStatusValue = undefined
    )
    @tokenStreamParser.on('doneInProc', (token) =>
        if @sqlRequest
          @sqlRequest.emit('doneInProc', token.rowCount, token.more)
    )
    @tokenStreamParser.on('done', (token) =>
        if @sqlRequest
          @sqlRequest.emit('done', token.rowCount, token.more)
    )

  connect: ->
    @socket = new Socket({})
    @socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY)
    @socket.connect(@config.options.port, @config.server)
    @socket.on('error', @socketError)
    @socket.on('connect', @socketConnect)
    @socket.on('close', @socketClose)
    @socket.on('end', @socketClose)

    @messageIo = new MessageIO(@socket, @config.options.packetSize, @debug)
    @messageIo.on('packet', (packet) =>
      @dispatchEvent('packet', packet)
    )
    @messageIo.on('message', =>
      @dispatchEvent('message')
    )

  closeConnection: ->
    @socket.destroy()

  createConnectTimer: ->
    @connectTimer = setTimeout(@connectTimeout, @config.options.connectTimeout)

  connectTimeout: =>
    message = "timeout : failed to connect to #{@config.server}:#{@config.options.port} in #{@config.options.connectTimeout}ms"

    @debug.log(message)
    @emit('connection', message)
    @connectTimer = undefined
    @dispatchEvent('connectTimeout')

  clearConnectTimer: ->
    if @connectTimer
      clearTimeout(@connectTimer)

  transitionTo: (newState) ->
    if @state?.exit
      @state.exit.apply(@)

    @debug.log("State change: #{@state?.name} -> #{newState.name}")
    @state = newState

    if @state.enter
      @state.enter.apply(@)

  dispatchEvent: (eventName, args...) ->
    if @state.events && @state.events.hasOwnProperty(eventName)
      eventFunction = @state.events[eventName].apply(@, args)
    else
      throw new Error("No event '#{eventName}' in state '#{@state.name}'")

  socketError: (error) =>
    message = "connection to #{@config.server}:#{@config.options.port} failed"

    @debug.log(message)
    @emit('connection', message)
    @dispatchEvent('socketError', error)

  socketConnect: =>
    @debug.log("connected to #{@config.server}:#{@config.options.port}")
    @dispatchEvent('socketConnect')

  socketClose: =>
    @debug.log("connection to #{@config.server}:#{@config.options.port} closed")
    @transitionTo(@STATE.FINAL)

  sendPreLogin: ->
    payload = new PreloginPayload()
    @messageIo.sendMessage(TYPE.PRELOGIN, payload.data)
    @debug.payload(payload.toString('  '))

  emptyMessageBuffer: ->
    @messageBuffer = new Buffer(0)

  addToMessageBuffer: (packet) ->
    @messageBuffer = @messageBuffer.concat(packet.data())

  processPreLoginResponse: ->
    preloginPayload = new PreloginPayload(@messageBuffer)
    @debug.payload(preloginPayload.toString('  '))

  sendLogin7Packet: ->
    loginData =
      userName: @config.userName
      password: @config.password
      database: @config.options.database
      packetSize: @config.options.packetSize

    payload = new Login7Payload(loginData)
    @messageIo.sendMessage(TYPE.LOGIN7, payload.data)
    @debug.payload(payload.toString('  '))

  sendPacketToTokenStreamParser: (packet) ->
    @tokenStreamParser.addBuffer(packet.data())

  processLogin7Response: ->
    if @loggedIn
      @clearConnectTimer()
      @transitionTo(@STATE.LOGGED_IN)
      @emit('connection')
    else
      @emit('connection', 'Login failed; one or more errorMessage events should have been emitted')
      @transitionTo(@STATE.FINAL)

  execSql: (request) ->
    if @state != @STATE.LOGGED_IN
      message = "Invalid state; requests can only be made in the #{@STATE.LOGGED_IN.name} state, not the #{@state.name} state"

      @debug.log(message)
      request.callback(message)
    else
      @sqlRequest = request

      payload = new SqlBatchPayload(request.sqlText)
      @messageIo.sendMessage(TYPE.SQL_BATCH, payload.data)
      @debug.payload(payload.toString('  '))

      @transitionTo(@STATE.SENT_CLIENT_REQUEST)

module.exports = Connection
