require('./buffertools')
Debug = require('./debug')
EventEmitter = require('events').EventEmitter
instanceLookup = require('./instance-lookup').instanceLookup
TYPE = require('./packet').TYPE
PreloginPayload = require('./prelogin-payload')
Login7Payload = require('./login7-payload')
Request = require('./request')
RpcRequestPayload = require('./rpcrequest-payload')
SqlBatchPayload = require('./sqlbatch-payload')
MessageIO = require('./message-io')
Socket = require('net').Socket
TokenStreamParser = require('./token/token-stream-parser').Parser
Transaction = require('./transaction').Transaction
ISOLATION_LEVEL = require('./transaction').ISOLATION_LEVEL
crypto = require('crypto')
tls = require('tls')

# A rather basic state machine for managing a connection.
# Implements something approximating s3.2.1.

KEEP_ALIVE_INITIAL_DELAY = 30 * 1000
DEFAULT_CONNECT_TIMEOUT = 15 * 1000
DEFAULT_CLIENT_REQUEST_TIMEOUT = 15 * 1000
DEFAULT_CANCEL_TIMEOUT = 5 * 1000
DEFAULT_PACKET_SIZE = 4 * 1024
DEFAULT_TEXTSIZE = '2147483647'
DEFAULT_PORT = 1433
DEFAULT_TDS_VERSION = '7_2'

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
        data: (data) ->
          @addToMessageBuffer(data)
        message: ->
          @processPreLoginResponse()
        noTls: ->
          @sendLogin7Packet()
          @transitionTo(@STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN)
        tls: ->
          @initiateTlsSslHandshake()
          @sendLogin7Packet()
          @transitionTo(@STATE.SENT_TLSSSLNEGOTIATION)

    SENT_TLSSSLNEGOTIATION:
      name: 'SentTLSSSLNegotiation'
      enter: ->
      events:
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
        connectTimeout: ->
          @transitionTo(@STATE.FINAL)
        data: (data) ->
          @securePair.encrypted.write(data)
        tlsNegotiated: ->
          @tlsNegotiationComplete = true
        message: ->
          if  @tlsNegotiationComplete
            @transitionTo(@STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN)
          else

    SENT_LOGIN7_WITH_STANDARD_LOGIN:
      name: 'SentLogin7WithStandardLogin'
      events:
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
        connectTimeout: ->
          @transitionTo(@STATE.FINAL)
        data: (data) ->
          @sendDataToTokenStreamParser(data)
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
        connectTimeout: ->
          @transitionTo(@STATE.FINAL)
        data: (data) ->
          @sendDataToTokenStreamParser(data)
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
        data: (data) ->
          @sendDataToTokenStreamParser(data)
        message: ->
          @transitionTo(@STATE.LOGGED_IN)

          sqlRequest = @request
          @request = undefined
          sqlRequest.callback(sqlRequest.error, sqlRequest.rowCount, sqlRequest.rows)

    FINAL:
      name: 'Final'
      enter: ->
        @cleanupConnection()
      events:
        loginFailed: ->
          # Do nothing. The connection was probably closed by the client code.
        connectTimeout: ->
          # Do nothing, as the timer should be cleaned up.
        message: ->
          # Do nothing
        socketError: ->
          # Do nothing

  constructor: (@config) ->
    @defaultConfig()
    @createDebug()
    @createTokenStreamParser()

    @transactions = []
    @transactionDescriptors = [new Buffer([0, 0, 0, 0, 0, 0, 0, 0])]

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
    @config.options.tdsVersion ||= DEFAULT_TDS_VERSION
    @config.options.isolationLevel ||= ISOLATION_LEVEL.READ_UNCOMMITTED
    @config.options.encrypt ||= false
    @config.options.cryptoCredentialsDetails ||= {}

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
    @tokenStreamParser = new TokenStreamParser(@debug, undefined, @config.options.tdsVersion)
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
    @tokenStreamParser.on('beginTransaction', (token) =>
      @transactionDescriptors.push(token.newValue)
    )
    @tokenStreamParser.on('commitTransaction', (token) =>
      @transactionDescriptors.pop()
    )
    @tokenStreamParser.on('rollbackTransaction', (token) =>
      @transactionDescriptors.pop()
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
        if @config.options.rowCollectionOnRequestCompletion || @config.options.rowCollectionOnDone
          @request.rows.push token.columns

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
        @request.emit('doneProc', token.rowCount, token.more, @procReturnStatusValue, @request.rows)
        @procReturnStatusValue = undefined

        if token.rowCount != undefined
          @request.rowCount += token.rowCount

        if @config.options.rowCollectionOnDone
          @request.rows = []
    )
    @tokenStreamParser.on('doneInProc', (token) =>
      if @request
        @request.emit('doneInProc', token.rowCount, token.more, @request.rows)

        if token.rowCount != undefined
          @request.rowCount += token.rowCount

        if @config.options.rowCollectionOnDone
          @request.rows = []
    )
    @tokenStreamParser.on('done', (token) =>
      if @request
        @request.emit('done', token.rowCount, token.more, @request.rows)

        if token.rowCount != undefined
          @request.rowCount += token.rowCount

        if @config.options.rowCollectionOnDone
          @request.rows = []
    )
    @tokenStreamParser.on('resetConnection', (token) =>
      @emit('resetConnection')
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
    @messageIo.on('data', (data) =>
      @dispatchEvent('data', data)
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
    payload = new PreloginPayload({encrypt: @config.options.encrypt})
    @messageIo.sendMessage(TYPE.PRELOGIN, payload.data)
    @debug.payload(->
      payload.toString('  ')
    )

  emptyMessageBuffer: ->
    @messageBuffer = new Buffer(0)

  addToMessageBuffer: (data) ->
    @messageBuffer = Buffer.concat([@messageBuffer, data])

  processPreLoginResponse: ->
    preloginPayload = new PreloginPayload(@messageBuffer)
    @debug.payload(->
      preloginPayload.toString('  ')
    )

    if preloginPayload.encryptionString == 'ON'
      @dispatchEvent('tls')
    else
      @dispatchEvent('noTls')

  sendLogin7Packet: ->
    loginData =
      userName: @config.userName
      password: @config.password
      database: @config.options.database
      appName: @config.options.appName
      packetSize: @config.options.packetSize
      tdsVersion: @config.options.tdsVersion

    payload = new Login7Payload(loginData)
    @messageIo.sendMessage(TYPE.LOGIN7, payload.data)
    @debug.payload(->
      payload.toString('  ')
    )

  initiateTlsSslHandshake: ->
    @config.options.cryptoCredentialsDetails.ciphers ||= 'RC4-MD5'

    credentials = crypto.createCredentials(@config.options.cryptoCredentialsDetails)
    @securePair = tls.createSecurePair(credentials)

    @securePair.on('secure', =>
      cipher = @securePair.cleartext.getCipher()
      @debug.log("TLS negotiated (#{cipher.name}, #{cipher.version})")
      # console.log cipher
      # console.log @securePair.cleartext.getPeerCertificate()

      @emit('secure', @securePair.cleartext)
      @messageIo.encryptAllFutureTraffic()
      @dispatchEvent('tlsNegotiated')
    )

    @securePair.encrypted.on('data', (data) =>
      @messageIo.sendMessage(TYPE.PRELOGIN, data)
    )

    @messageIo.tlsNegotiationStarting(@securePair)

  sendDataToTokenStreamParser: (data) ->
    @tokenStreamParser.addBuffer(data)

  sendInitialSql: ->
    payload = new SqlBatchPayload(@getInitialSql(), @currentTransactionDescriptor())
    @messageIo.sendMessage(TYPE.SQL_BATCH, payload.data)

  getInitialSql: ->
    'set textsize ' + @config.options.textsize + '''
set quoted_identifier on
set arithabort off
set numeric_roundabort off
set ansi_warnings on
set ansi_padding on
set ansi_nulls on
set concat_null_yields_null on
set cursor_close_on_commit off
set implicit_transactions off
set language us_english
set dateformat mdy
set datefirst 7
set transaction isolation level read committed'''

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
    @makeRequest(request, TYPE.SQL_BATCH, new SqlBatchPayload(request.sqlTextOrProcedure, @currentTransactionDescriptor()))

  execSql: (request) ->
    request.transformIntoExecuteSqlRpc()
    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor()))

  prepare: (request) ->
    request.transformIntoPrepareRpc()
    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor()))

  unprepare: (request) ->
    request.transformIntoUnprepareRpc()
    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor()))

  execute: (request, parameters) ->
    request.transformIntoExecuteRpc(parameters)
    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor()))

  callProcedure: (request) ->
    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor()))

  beginTransaction: (callback, name, isolationLevel) ->
    name ||= ''
    isolationLevel ||= @config.options.isolationLevel

    transaction = new Transaction(name, isolationLevel)
    @transactions.push(transaction)

    request = new Request(undefined, (err) =>
      callback(err, @currentTransactionDescriptor())
    )

    @makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.beginPayload(@currentTransactionDescriptor()))

  commitTransaction: (callback) ->
    if @transactions.length == 0
      throw new Error('No transaction in progress')
    transaction = @transactions.pop()

    request = new Request(undefined, callback)

    @makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.commitPayload(@currentTransactionDescriptor()))

  rollbackTransaction: (callback) ->
    if @transactions.length == 0
      throw new Error('No transaction in progress')
    transaction = @transactions.pop()

    request = new Request(undefined, callback)

    @makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.rollbackPayload(@currentTransactionDescriptor()))

  makeRequest: (request, packetType, payload) ->
    if @state != @STATE.LOGGED_IN
      message = "Invalid state; requests can only be made in the #{@STATE.LOGGED_IN.name} state, not the #{@state.name} state"

      @debug.log(message)
      request.callback(message)
    else
      @request = request
      @request.rowCount = 0
      @request.rows = []

      @messageIo.sendMessage(packetType, payload.data, @resetConnectionOnNextRequest)
      @resetConnectionOnNextRequest = false
      @debug.payload(->
        payload.toString('  ')
      )

      @transitionTo(@STATE.SENT_CLIENT_REQUEST)

  reset: (callback) =>
    request = new Request(@getInitialSql(), (err, rowCount, rows) ->
      callback(err)
    )

    @resetConnectionOnNextRequest = true
    @execSqlBatch(request)

  currentTransactionDescriptor: ->
    @transactionDescriptors[@transactionDescriptors.length - 1]

module.exports = Connection
