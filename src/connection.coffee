require('./buffertools')
BulkLoad = require('./bulk-load')
Debug = require('./debug')
EventEmitter = require('events').EventEmitter
instanceLookup = require('./instance-lookup').instanceLookup
TYPE = require('./packet').TYPE
PreloginPayload = require('./prelogin-payload')
Login7Payload = require('./login7-payload')
NTLMResponsePayload = require('./ntlm-payload')
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

{ConnectionError, RequestError} = require('./errors')

# A rather basic state machine for managing a connection.
# Implements something approximating s3.2.1.

KEEP_ALIVE_INITIAL_DELAY = 30 * 1000
DEFAULT_CONNECT_TIMEOUT = 15 * 1000
DEFAULT_CLIENT_REQUEST_TIMEOUT = 15 * 1000
DEFAULT_CANCEL_TIMEOUT = 5 * 1000
DEFAULT_PACKET_SIZE = 4 * 1024
DEFAULT_TEXTSIZE = '2147483647'
DEFAULT_PORT = 1433
DEFAULT_TDS_VERSION = '7_4'

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
          if @config.domain
            @transitionTo(@STATE.SENT_LOGIN7_WITH_NTLM)
          else
            @transitionTo(@STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN)
        tls: ->
          @initiateTlsSslHandshake()
          @sendLogin7Packet()
          @transitionTo(@STATE.SENT_TLSSSLNEGOTIATION)

    REROUTING:
      name: 'ReRouting'
      enter: ->
        @cleanupConnection(true)
      events:
        message: ->
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
        connectTimeout: ->
          @transitionTo(@STATE.FINAL)
        reconnect: ->
          @config.server = @routingData.server
          @config.options.port = @routingData.port
          @transitionTo(@STATE.CONNECTING)

    SENT_TLSSSLNEGOTIATION:
      name: 'SentTLSSSLNegotiation'
      enter: ->
        @tlsNegotiationComplete = false
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
        routingChange: ->
          @transitionTo(@STATE.REROUTING)
        loginFailed: ->
          @transitionTo(@STATE.FINAL)
        message: ->
          @processLogin7Response()

    SENT_LOGIN7_WITH_NTLM:
      name: 'SentLogin7WithNTLMLogin'
      events:
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
        connectTimeout: ->
          @transitionTo(@STATE.FINAL)
        data: (data) ->
          @sendDataToTokenStreamParser(data)
        receivedChallenge: ->
          @sendNTLMResponsePacket()
          @transitionTo(@STATE.SENT_NTLM_RESPONSE)
        loginFailed: ->
          @transitionTo(@STATE.FINAL)
        message: ->
          @processLogin7NTLMResponse()

    SENT_NTLM_RESPONSE:
      name: 'SentNTLMResponse'
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
        routingChange: ->
          @transitionTo(@STATE.REROUTING)
        message: ->
          @processLogin7NTLMAck()

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
          @clearRequestTimer()
          @transitionTo(@STATE.LOGGED_IN)

          sqlRequest = @request
          @request = undefined
          sqlRequest.callback(sqlRequest.error, sqlRequest.rowCount, sqlRequest.rows)

    SENT_ATTENTION:
      name: 'SentAttention'
      enter: ->
        @attentionReceived = false
      events:
        socketError: (error) ->
          @transitionTo(@STATE.FINAL)
        data: (data) ->
          @sendDataToTokenStreamParser(data)
        attention: ->
          @attentionReceived = true
        message: ->
          # 3.2.5.7 Sent Attention State
          # Discard any data contained in the response, until we receive the attention response
          if @attentionReceived
            sqlRequest = @request
            @request = undefined

            @transitionTo(@STATE.LOGGED_IN)

            if sqlRequest.canceled
              sqlRequest.callback(RequestError("Canceled.", 'ECANCEL'))
            else
              message = "Timeout: Request failed to complete in #{@config.options.requestTimeout}ms"
              sqlRequest.callback(RequestError(message, 'ETIMEOUT'))


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

    @inTransaction = false
    @transactionDescriptors = [new Buffer([0, 0, 0, 0, 0, 0, 0, 0])]

    @transitionTo(@STATE.CONNECTING)

  close: ->
    @transitionTo(@STATE.FINAL)

  initialiseConnection: ->
    @connect()
    @createConnectTimer()

  cleanupConnection: (@redirect)->
    if !@closed
      @clearConnectTimer()
      @clearRequestTimer()
      @closeConnection()
      if !@redirect
        @emit('end')
      else
        @emit('rerouting')
      @closed = true
      @loggedIn = false
      @loginError = null

  defaultConfig: ->
    @config.options ||= {}
    @config.options.textsize ||= DEFAULT_TEXTSIZE
    @config.options.connectTimeout ||= DEFAULT_CONNECT_TIMEOUT
    @config.options.requestTimeout ?= DEFAULT_CLIENT_REQUEST_TIMEOUT
    @config.options.cancelTimeout ?= DEFAULT_CANCEL_TIMEOUT
    @config.options.packetSize ||= DEFAULT_PACKET_SIZE
    @config.options.tdsVersion ||= DEFAULT_TDS_VERSION
    @config.options.isolationLevel ||= ISOLATION_LEVEL.READ_COMMITTED
    @config.options.encrypt ||= false
    @config.options.cryptoCredentialsDetails ||= {}
    @config.options.useUTC ?= true
    @config.options.useColumnNames ?= false
    @config.options.connectionIsolationLevel ||= ISOLATION_LEVEL.READ_COMMITTED
    @config.options.readOnlyIntent ?= false

    if !@config.options.port && !@config.options.instanceName
      @config.options.port = DEFAULT_PORT
    else if @config.options.port && @config.options.instanceName
      throw new Error("Port and instanceName are mutually exclusive, but #{@config.options.port} and #{@config.options.instanceName} provided")
    else if @config.options.port
      if @config.options.port < 0 or @config.options.port > 65536
        throw new RangeError "Port should be > 0 and < 65536"
    
    if @config.options.columnNameReplacer && typeof @config.options.columnNameReplacer != 'function'
      throw new TypeError('options.columnNameReplacer must be a function or null.')

  createDebug: ->
    @debug = new Debug(@config.options.debug)
    @debug.on('debug', (message) =>
        @emit('debug', message)
    )

  createTokenStreamParser: ->
    @tokenStreamParser = new TokenStreamParser(@debug, undefined, @config.options)
    @tokenStreamParser.on('infoMessage', (token) =>
      @emit('infoMessage', token)
    )
    @tokenStreamParser.on('sspichallenge', (token) =>
      if token.ntlmpacket
        @ntlmpacket = token.ntlmpacket
      @emit('sspichallenge', token)
    )
    @tokenStreamParser.on('errorMessage', (token) =>
      @emit('errorMessage', token)
      if @loggedIn
        if @request
          @request.error = RequestError token.message, 'EREQUEST'
          @request.error.number = token.number
          @request.error.state = token.state
          @request.error.class = token.class
          @request.error.serverName = token.serverName
          @request.error.procName = token.procName
          @request.error.lineNumber = token.lineNumber
      else
        @loginError = ConnectionError token.message, 'ELOGIN'
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
      unless token.tdsVersion
        # unsupported TDS version
        @loginError = ConnectionError "Server responded with unknown TDS version.", 'ETDS'
        @loggedIn = false
        return
      
      unless token.interface
        # unsupported interface
        @loginError = ConnectionError "Server responded with unsupported interface.", 'EINTERFACENOTSUPP'
        @loggedIn = false
        return
        
      # use negotiated version
      @config.options.tdsVersion = token.tdsVersion
      @loggedIn = true
    )
    @tokenStreamParser.on('routingChange', (token) =>
      @routingData = token.newValue
      @dispatchEvent('routingChange')
    )
    @tokenStreamParser.on('packetSizeChange', (token) =>
      @messageIo.packetSize(token.newValue)
    )

    # A new top-level transaction was started. This is not fired
    # for nested transactions.
    @tokenStreamParser.on('beginTransaction', (token) =>
      @transactionDescriptors.push(token.newValue)
      @inTransaction = true
    )

    # A top-level transaction was committed. This is not fired
    # for nested transactions.
    @tokenStreamParser.on('commitTransaction', (token) =>
      @transactionDescriptors.length = 1
      @inTransaction = false
    )

    # A top-level transaction was rolled back. This is not fired
    # for nested transactions. This is also fired if a batch
    # aborting error happened that caused a rollback.
    @tokenStreamParser.on('rollbackTransaction', (token) =>
      @transactionDescriptors.length = 1
      # An outermost transaction was rolled back. Reset the transaction counter
      @inTransaction = false
      @emit('rollbackTransaction')
    )

    @tokenStreamParser.on('columnMetadata', (token) =>
        if @request
          if @config.options.useColumnNames
            columns = {}
            columns[col.colName] = col for col in token.columns when not columns[col.colName]?
          else
            columns = token.columns
            
          @request.emit('columnMetadata', columns)
        else
          @emit 'error', new Error "Received 'columnMetadata' when no sqlRequest is in progress"
          @close()
    )
    @tokenStreamParser.on('order', (token) =>
        if @request
          @request.emit('order', token.orderColumns)
        else
          @emit 'error', new Error "Received 'order' when no sqlRequest is in progress"
          @close()
    )
    @tokenStreamParser.on('row', (token) =>
      if @request
        if @config.options.rowCollectionOnRequestCompletion
          @request.rows.push token.columns
        
        if @config.options.rowCollectionOnDone
          @request.rst.push token.columns

        @request.emit('row', token.columns)
      else
        @emit 'error', new Error "Received 'row' when no sqlRequest is in progress"
        @close()
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
        @request.emit('doneProc', token.rowCount, token.more, @procReturnStatusValue, @request.rst)
        @procReturnStatusValue = undefined

        if token.rowCount != undefined
          @request.rowCount += token.rowCount

        if @config.options.rowCollectionOnDone
          @request.rst = []
    )
    @tokenStreamParser.on('doneInProc', (token) =>
      if @request
        @request.emit('doneInProc', token.rowCount, token.more, @request.rst)

        if token.rowCount != undefined
          @request.rowCount += token.rowCount

        if @config.options.rowCollectionOnDone
          @request.rst = []
    )
    @tokenStreamParser.on('done', (token) =>
      if @request
        if token.attention
          @dispatchEvent("attention")
        
        # check if the DONE_ERROR flags was set, but an ERROR token was not sent.
        if token.sqlError && !@request.error
          @request.error = RequestError('An unknown error has occurred.', 'UNKNOWN')

        @request.emit('done', token.rowCount, token.more, @request.rst)

        if token.rowCount != undefined
          @request.rowCount += token.rowCount

        if @config.options.rowCollectionOnDone
          @request.rst = []
    )
    @tokenStreamParser.on('resetConnection', (token) =>
      @emit('resetConnection')
    )
    @tokenStreamParser.on('tokenStreamError', (error) =>
      @emit 'error', error
      @close()
    )

  connect: ->
    if (@config.options.port)
      @connectOnPort(@config.options.port)
    else
      instanceLookup(
        @config.server
        @config.options.instanceName
        (message, port) =>
          if @state == @STATE.FINAL
            return
          if message
            @emit('connect', ConnectionError(message, 'EINSTLOOKUP'))
          else
            @connectOnPort(port)
        @config.options.connectTimeout)

  connectOnPort: (port) ->
    @socket = new Socket({})

    connectOpts =
      host: @config.server
      port: port

    if @config.options.localAddress
      connectOpts.localAddress = @config.options.localAddress

    @socket.connect(connectOpts)
    @socket.on('error', @socketError)
    @socket.on('connect', @socketConnect)
    @socket.on('close', @socketClose)
    @socket.on('end', @socketEnd)

    @messageIo = new MessageIO(@socket, @config.options.packetSize, @debug)
    @messageIo.on('data', (data) =>
      @dispatchEvent('data', data)
    )
    @messageIo.on('message', =>
      @dispatchEvent('message')
    )

  closeConnection: ->
    @socket?.destroy()

  createConnectTimer: ->
    @connectTimer = setTimeout(@connectTimeout, @config.options.connectTimeout)

  createRequestTimer: ->
    if @config.options.requestTimeout
      @requestTimer = setTimeout(@requestTimeout, @config.options.requestTimeout)

  connectTimeout: =>
    message = "Failed to connect to #{@config.server}:#{@config.options.port} in #{@config.options.connectTimeout}ms"

    @debug.log(message)
    @emit('connect', ConnectionError(message, 'ETIMEOUT'))
    @connectTimer = undefined
    @dispatchEvent('connectTimeout')

  requestTimeout: =>
    @requestTimer = undefined

    @messageIo.sendMessage(TYPE.ATTENTION)
    @transitionTo(@STATE.SENT_ATTENTION)

  clearConnectTimer: ->
    if @connectTimer
      clearTimeout(@connectTimer)

  clearRequestTimer: ->
    if @requestTimer
      clearTimeout(@requestTimer)

  transitionTo: (newState) ->
    if @state == newState
      @debug.log("State is already #{newState.name}")
      return
      
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
      @emit 'error', new Error "No event '#{eventName}' in state '#{@state.name}'"
      @close()

  socketError: (error) =>
    if @state == @STATE.CONNECTING
      message = "Failed to connect to #{@config.server}:#{@config.options.port} - #{error.message}"
      @debug.log(message)
      @emit('connect', ConnectionError(message, 'ESOCKET'))
    else
      message = "Connection lost - #{error.message}"
      @debug.log(message)
      @emit('error', ConnectionError(message, 'ESOCKET'))
    @dispatchEvent('socketError', error)

  socketConnect: =>
    @socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY)
    @closed = false
    @debug.log("connected to #{@config.server}:#{@config.options.port}")
    @dispatchEvent('socketConnect')

  socketEnd: =>
    @debug.log("socket ended")
    @transitionTo(@STATE.FINAL)

  socketClose: =>
    @debug.log("connection to #{@config.server}:#{@config.options.port} closed")
    if @state is @STATE.REROUTING
      @debug.log("Rerouting to #{@routingData.server}:#{@routingData.port}")
      @dispatchEvent('reconnect')
    else
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

    if preloginPayload.encryptionString in ['ON','REQ']
      @dispatchEvent('tls')
    else
      @dispatchEvent('noTls')

  sendLogin7Packet: ->
    loginData =
      domain: @config.domain
      userName: @config.userName
      password: @config.password
      database: @config.options.database
      serverName: @config.server
      appName: @config.options.appName
      packetSize: @config.options.packetSize
      tdsVersion: @config.options.tdsVersion
      initDbFatal: not @config.options.fallbackToDefaultDb
      readOnlyIntent: @config.options.readOnlyIntent

    payload = new Login7Payload(loginData)
    @messageIo.sendMessage(TYPE.LOGIN7, payload.data)
    @debug.payload(->
      payload.toString('  ')
    )

  sendNTLMResponsePacket: ->
    responseData =
      domain: @config.domain
      userName: @config.userName
      password: @config.password
      database: @config.options.database
      appName: @config.options.appName
      packetSize: @config.options.packetSize
      tdsVersion: @config.options.tdsVersion
      ntlmpacket: @ntlmpacket
      additional: @additional

    payload = new NTLMResponsePayload(responseData)
    @messageIo.sendMessage(TYPE.NTLMAUTH_PKT, payload.data)
    @debug.payload ->
      payload.toString '  '

  initiateTlsSslHandshake: ->
    credentials = if tls.createSecureContext
      tls.createSecureContext(@config.options.cryptoCredentialsDetails)
    else
      crypto.createCredentials(@config.options.cryptoCredentialsDetails)
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
    payload = new SqlBatchPayload(@getInitialSql(), @currentTransactionDescriptor(), @config.options)
    @messageIo.sendMessage(TYPE.SQL_BATCH, payload.data)

  getInitialSql: ->
    xact_abort = if @config.options.abortTransactionOnError then 'on' else 'off'
    """set textsize #{@config.options.textsize}
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
set transaction isolation level #{@getIsolationLevelText @config.options.connectionIsolationLevel}
set xact_abort #{xact_abort}"""

  processedInitialSql: ->
      @clearConnectTimer()
      @emit('connect')

  processLogin7Response: ->
    if @loggedIn
      @dispatchEvent('loggedIn')
    else
      if @loginError
        @emit('connect', @loginError)
      else
        @emit('connect', ConnectionError('Login failed.', 'ELOGIN'))
      @dispatchEvent('loginFailed')

  processLogin7NTLMResponse: ->
    if @ntlmpacket
      @dispatchEvent('receivedChallenge')
    else
      if @loginError
        @emit('connect', @loginError)
      else
        @emit('connect', ConnectionError('Login failed.', 'ELOGIN'))
      @dispatchEvent('loginFailed')

  processLogin7NTLMAck: ->
    if @loggedIn
      @dispatchEvent('loggedIn')
    else
      if @loginError
        @emit('connect', @loginError)
      else
        @emit('connect', ConnectionError('Login failed.', 'ELOGIN'))
      @dispatchEvent('loginFailed')

  execSqlBatch: (request) ->
    @makeRequest(request, TYPE.SQL_BATCH, new SqlBatchPayload(request.sqlTextOrProcedure, @currentTransactionDescriptor(), @config.options))

  execSql: (request) ->
    request.transformIntoExecuteSqlRpc()
    if request.error?
      return process.nextTick =>
        @debug.log request.error.message
        request.callback request.error

    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor(), @config.options))
  
  newBulkLoad: (table, callback) ->
    return new BulkLoad(table, @config.options, callback)
  
  execBulkLoad: (bulkLoad) ->
    request = new Request(bulkLoad.getBulkInsertSql(), (error) =>
      if error
        if error.code == 'UNKNOWN'
          error.message += ' This is likely because the schema of the BulkLoad does not match the schema of the table you are attempting to insert into.'
        bulkLoad.error = error
        bulkLoad.callback(error)
      else
        @makeRequest(bulkLoad, TYPE.BULK_LOAD, bulkLoad.getPayload())
    )
    @execSqlBatch(request)

  prepare: (request) ->
    request.transformIntoPrepareRpc()
    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor(), @config.options))

  unprepare: (request) ->
    request.transformIntoUnprepareRpc()
    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor(), @config.options))

  execute: (request, parameters) ->
    request.transformIntoExecuteRpc(parameters)
    if request.error?
      return process.nextTick =>
        @debug.log request.error.message
        request.callback request.error

    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor(), @config.options))

  callProcedure: (request) ->
    request.validateParameters()
    if request.error?
      return process.nextTick =>
        @debug.log request.error.message
        request.callback request.error

    @makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, @currentTransactionDescriptor(), @config.options))

  beginTransaction: (callback, name, isolationLevel) ->
    isolationLevel ||= @config.options.isolationLevel
      
    transaction = new Transaction(name || '', isolationLevel)
    if @config.options.tdsVersion < "7_2"
      return @execSqlBatch new Request "SET TRANSACTION ISOLATION LEVEL #{transaction.isolationLevelToTSQL()};BEGIN TRAN #{transaction.name}", callback

    request = new Request(undefined, (err) =>
      callback(err, @currentTransactionDescriptor())
    )

    @makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.beginPayload(@currentTransactionDescriptor()))

  commitTransaction: (callback, name) ->
    transaction = new Transaction(name || '')
    if @config.options.tdsVersion < "7_2"
      return  @execSqlBatch new Request "COMMIT TRAN #{transaction.name}", callback

    request = new Request(undefined, callback)
    @makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.commitPayload(@currentTransactionDescriptor()))

  rollbackTransaction: (callback, name) ->
    transaction = new Transaction(name || '')
    
    if @config.options.tdsVersion < "7_2"
      return @execSqlBatch new Request "ROLLBACK TRAN #{transaction.name}", callback

    request = new Request(undefined, callback)
    @makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.rollbackPayload(@currentTransactionDescriptor()))

  saveTransaction: (callback, name) ->
    transaction = new Transaction(name)

    if @config.options.tdsVersion < "7_2"
      return @execSqlBatch new Request "SAVE TRAN #{transaction.name}", callback

    request = new Request(undefined, callback)
    @makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.savePayload(@currentTransactionDescriptor()))

  transaction: (cb, isolationLevel) ->
    if typeof cb != 'function'
      throw new TypeError('`cb` must be a function')

    useSavepoint = @inTransaction
    name = "_tedious_#{crypto.randomBytes(10).toString('hex')}"

    txDone = (err, done) =>
      args = []
      args.push(arguments[i]) for i in [2...arguments.length]

      if err
        if @inTransaction
          @rollbackTransaction((txErr) ->
            args.unshift(txErr || err)
            done.apply(null, args)
          , name)
        else
          # We're no longer inside a transaction. This happens if the outermost transaction
          # was rolled back, for one of the following reasons:
          # * Connection#rollbackTransaction was called.
          # * `ROLLBACK TRANSACTION` was executed.
          # * the server rolled back the transaction, due to a batch aborting error.
          #
          # As the transaction was already rolled back, we only need to propagate
          # the error through all callbacks.
          process.nextTick ->
            args.unshift(err)
            done.apply(null, args)
      else
        if useSavepoint
          process.nextTick ->
            args.unshift(null)
            done.apply(null, args)
        else
          @commitTransaction((txErr) ->
            args.unshift(txErr)
            done.apply(null, args)
          , name)

    if useSavepoint
      @saveTransaction((err) =>
        return cb(err) if err

        if isolationLevel
          @execSqlBatch new Request "SET transaction isolation level #{@getIsolationLevelText(isolationLevel)}", (err) ->
            cb(err, txDone)
        else
          cb(null, txDone)
      , name)
    else
      @beginTransaction((err) ->
        return cb(err) if err

        cb(null, txDone)
      , name, isolationLevel)

  makeRequest: (request, packetType, payload) ->
    if @state != @STATE.LOGGED_IN
      message = "Requests can only be made in the #{@STATE.LOGGED_IN.name} state, not the #{@state.name} state"

      @debug.log(message)
      request.callback RequestError message, 'EINVALIDSTATE'
    else
      @request = request
      @request.rowCount = 0
      @request.rows = []
      @request.rst = []

      @createRequestTimer()

      @messageIo.sendMessage(packetType, payload.data, @resetConnectionOnNextRequest)
      @resetConnectionOnNextRequest = false
      @debug.payload(->
        payload.toString('  ')
      )

      @transitionTo(@STATE.SENT_CLIENT_REQUEST)
  
  cancel: ->
    if @state != @STATE.SENT_CLIENT_REQUEST
      message = "Requests can only be canceled in the #{@STATE.SENT_CLIENT_REQUEST.name} state, not the #{@state.name} state"

      @debug.log(message)
      false
    else
      @request.canceled = true

      @messageIo.sendMessage(TYPE.ATTENTION)
      @transitionTo(@STATE.SENT_ATTENTION)
      true

  reset: (callback) =>
    request = new Request(@getInitialSql(), (err, rowCount, rows) ->
      callback(err)
    )

    @resetConnectionOnNextRequest = true
    @execSqlBatch(request)

  currentTransactionDescriptor: ->
    @transactionDescriptors[@transactionDescriptors.length - 1]

  getIsolationLevelText: (isolationLevel) ->
    switch isolationLevel
      when ISOLATION_LEVEL.READ_UNCOMMITTED then 'read uncommitted'
      when ISOLATION_LEVEL.REPEATABLE_READ then 'repeatable read'
      when ISOLATION_LEVEL.SERIALIZABLE then 'serializable'
      when ISOLATION_LEVEL.SNAPSHOT then 'snapshot'
      else 'read committed'


module.exports = Connection
