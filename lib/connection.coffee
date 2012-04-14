require('./buffertools')
Debug = require('./debug')
EventEmitter = require('events').EventEmitter
instanceLookup = require('./instance-lookup').instanceLookup
TYPE = require('./packet').TYPE
PreloginPayload = require('./prelogin-payload')
Login7Payload = require('./login7-payload')
RpcRequestPayload = require('./rpcrequest-payload')
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
DEFAULT_TEXTSIZE = '2147483647'
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
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
        connectTimeout: ->
          @transitionTo(@STATE.FINAL)
        packet: (packet) ->
          @addToMessageBuffer(packet)
        message: ->
          @processPreLoginResponse()
          @sendLogin7Packet()
          @transitionTo(@STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN)
    SENT_LOGIN7_WITH_STANDARD_LOGIN:
      name: 'SentLogin7WithStandardLogin'
      events:
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
        connectTimeout: ->
          @transitionTo(@STATE.FINAL)
        packet: (packet) ->
          @sendPacketToTokenStreamParser(packet)
        loggedIn: ->
          @transitionTo(@STATE.LOGGED_IN_SENDING_INITIAL_SQL)
        loginFailed: ->
          @transitionTo(@STATE.FINAL)
        message: ->
          @processLogin7Response()
    LOGGED_IN_SENDING_INITIAL_SQL:
      name: 'LoggedInSendingInitialSql'
      enter: ->
        @sendInitialSql()
      events:
        packet: (packet) ->
          @sendPacketToTokenStreamParser(packet)
        message: (error) ->
          @transitionTo(@STATE.LOGGED_IN)
          @processedInitialSql()
    LOGGED_IN:
      name: 'LoggedIn'
      events:
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
    SENT_CLIENT_REQUEST:
      name: 'SentClientRequest'
      events:
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
        packet: (packet) ->
          @sendPacketToTokenStreamParser(packet)
        message: ->
          @transitionTo(@STATE.LOGGED_IN)

          sqlRequest = @request
          @request = undefined
          sqlRequest.callback(sqlRequest.error, sqlRequest.rowCount)
    FINAL:
      name: 'Final'
      enter: ->
        @cleanupConnection()
      events:
        loginFailed: ->
          # Do nothing. The connection was probably closed by the client code.
        connectTimeout: ->
          # Do nothing, as the timer should be cleaned up.

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
    @config.options.textsize ||= DEFAULT_TEXTSIZE
    @config.options.connectTimeout ||= DEFAULT_CONNECT_TIMEOUT
    @config.options.requestTimeout ||= DEFAULT_CLIENT_REQUEST_TIMEOUT
    @config.options.cancelTimeout ||= DEFAULT_CANCEL_TIMEOUT
    @config.options.packetSize ||= DEFAULT_PACKET_SIZE

    if !@config.options.port && !@config.options.instanceName
      @config.options.port = DEFAULT_PORT
    else if @config.options.port && @config.options.instanceName
      throw new Error("Port and instanceName are mutually exclusive, but #{config.options.port} and #{config.options.instanceName} provided")


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
      if @request
        @request.error = token.message
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
        if @request
          @request.emit('columnMetadata', token.columns)
        else
          throw new Error("Received 'columnMetadata' when no sqlRequest is in progress")
    )
    @tokenStreamParser.on('order', (token) =>
        if @request
          @request.emit('order', token.orderColumns)
        else
          throw new Error("Received 'order' when no sqlRequest is in progress")
    )
    @tokenStreamParser.on('row', (token) =>
      if @request
        @request.rowCount++
        @request.emit('row', token.columns)
      else
        throw new Error("Received 'row' when no sqlRequest is in progress")
    )
    @tokenStreamParser.on('returnStatus', (token) =>
      if @request
        # Keep value for passing in 'doneProc' event.
        @procReturnStatusValue = token.value
    )
    @tokenStreamParser.on('returnValue', (token) =>
        if @request
          @request.emit('returnValue', token.paramName, token.value, token.metadata)
    )
    @tokenStreamParser.on('doneProc', (token) =>
      if @request
        @request.emit('doneProc', token.rowCount, token.more, @procReturnStatusValue)
        @procReturnStatusValue = undefined
    )
    @tokenStreamParser.on('doneInProc', (token) =>
        if @request
          @request.emit('doneInProc', token.rowCount, token.more)
    )
    @tokenStreamParser.on('done', (token) =>
        if @request
          @request.emit('done', token.rowCount, token.more)
    )

  connect: ->
    if (@config.options.port)
      @connectOnPort(@config.options.port)
    else
      instanceLookup(@config.server, @config.options.instanceName, (err, port) =>
        if err
          throw new Error(err)
        else
          @connectOnPort(port)
      )

  connectOnPort: (port) ->
    @socket = new Socket({})
    @socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY)
    @socket.connect(port, @config.server)
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
    @emit('connect', message)
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
    if @state?.events[eventName]
      eventFunction = @state.events[eventName].apply(@, args)
    else
      throw new Error("No event '#{eventName}' in state '#{@state.name}'")

  socketError: (error) =>
    message = "connection to #{@config.server}:#{@config.options.port} - failed #{error}"

    @debug.log(message)
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
    @debug.payload(->
      payload.toString('  ')
    )

  emptyMessageBuffer: ->
    @messageBuffer = new Buffer(0)

  addToMessageBuffer: (packet) ->
    @messageBuffer = @messageBuffer.concat(packet.data())

  processPreLoginResponse: ->
    preloginPayload = new PreloginPayload(@messageBuffer)
    @debug.payload(->
      preloginPayload.toString('  ')
    )

  sendLogin7Packet: ->
    loginData =
      userName: @config.userName
      password: @config.password
      database: @config.options.database
      packetSize: @config.options.packetSize

    payload = new Login7Payload(loginData)
    @messageIo.sendMessage(TYPE.LOGIN7, payload.data)
    @debug.payload(->
      payload.toString('  ')
    )

  sendPacketToTokenStreamParser: (packet) ->
    @tokenStreamParser.addBuffer(packet.data())

  sendInitialSql: ->
    payload = new SqlBatchPayload('set textsize ' + @config.options.textsize)
    @messageIo.sendMessage(TYPE.SQL_BATCH, payload.data)

  processedInitialSql: ->
      @clearConnectTimer()
      @emit('connect')

  processLogin7Response: ->
    if @loggedIn
      @dispatchEvent('loggedIn')
    else
      @emit('connect', 'Login failed; one or more errorMessage events should have been emitted')
      @dispatchEvent('loginFailed')

  execSqlBatch: (request) ->
      @makeRequest(request, TYPE.SQL_BATCH, new SqlBatchPayload(request.sqlTextOrProcedure))

  execSql: (request) ->
      request.transformIntoExecuteSqlRpc()
      @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request))

  callProcedure: (request) ->
      @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request))

  makeRequest: (request, packetType, payload) ->
    if @state != @STATE.LOGGED_IN
      console.trace()
      message = "Invalid state; requests can only be made in the #{@STATE.LOGGED_IN.name} state, not the #{@state.name} state"

      @debug.log(message)
      request.callback(message)
    else
      @request = request
      @request.rowCount = 0

      @messageIo.sendMessage(packetType, payload.data)
      @debug.payload(->
        payload.toString('  ')
      )

      @transitionTo(@STATE.SENT_CLIENT_REQUEST)

module.exports = Connection
