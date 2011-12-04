require('buffertools')
Debug = require('./debug')
EventEmitter = require('events').EventEmitter
TYPE = require('./packet').TYPE
PreloginPayload = require('./prelogin-payload')
Login7Payload = require('./login7-payload')
SqlBatchPayload = require('./sqlbatch-payload')
MessageIO = require('./message-io')
Socket = require('net').Socket
TokenStreamParser = require('./token/token-stream-parser').Parser

# s3.2.1
STATE =
  INITIAL: 0,
  SENT_PRELOGIN: 1,
  SENT_LOGIN7: 2,
  LOGGED_IN: 3,
  SENT_CLIENT_REQUEST: 4,
  SENT_ATTENTION: 5,
  FINAL: 6


class Connection extends EventEmitter
  constructor: (@server, @userName, @password, @options, callback) ->
    @options ||= {}
    @options.port ||= 1433
    @options.timeout ||= 10 * 1000

    @loggedIn = false
    @state = STATE.INITIAL

    @debug = new Debug(@options.debug)
    @debug.on('debug', (message) =>
      if @state != STATE.FINAL
        @emit('debug', message)
    )

    @messagePayloadBuffer = new Buffer(0)
    @createTokenStreamParser()

    @connection = new Socket({})
    @connection.setTimeout(options.timeout)
    @connection.connect(@options.port, @server)

    @connection.addListener('close', @eventClose)
    @connection.addListener('connect', @eventConnect)
    @connection.addListener('end', @eventEnd)
    @connection.addListener('error', @eventError)
    @connection.addListener('timeout', @eventTimeout)

    @messageIo = new MessageIO(@connection, @debug)
    @messageIo.on('packet', @eventPacket)

    @startRequest('connect/login', callback)

    @packetBuffer = new Buffer(0)

  execSql: (request) ->
    @sqlRequest = request
    @startRequest('execSql', request.callback)

    payload = new SqlBatchPayload(request.sqlText)
    
    @state = STATE.SENT_CLIENT_REQUEST
    @messageIo.sendMessage(TYPE.SQL_BATCH, payload.data)
    @debug.payload(payload.toString('  '))

  eventClose: (hadError) =>
    @emit('closed')
    @debug.log("connection close, hadError:#{hadError}")

  eventConnect: =>
    @debug.log('connected')
    @sendPreLoginPacket()

  eventEnd: =>
    @debug.log('end')

  eventError: (exception) =>
    @fatalError(exception)
    @connection.destroy()

  eventTimeout: =>
    @emit('timeout')
    @fatalError('timeout')
    @connection.destroy()

  eventPacket: (packet) =>
    switch @state
      when STATE.SENT_PRELOGIN
        @buildMessage(packet, @processPreloginResponse)
      when STATE.SENT_LOGIN7, STATE.SENT_CLIENT_REQUEST
        @tokenStreamParser.addBuffer(packet.data())
      else
        @fatalError("Unexpected packet in state #{@state}: packet type #{packet.type()}")

  # Accumulates packet payloads into a buffer until all of the packets
  # for a message have been received.
  #
  # Only used during some states, when we want to process the complete message.
  # For other states the payloads are processed for each packet as they arrive.
  buildMessage: (packet, payloadProcessFunction) ->
    @messagePayloadBuffer = new Buffer(@messagePayloadBuffer.concat(packet.data()))

    if (packet.isLast())
      payloadProcessFunction.call(@)
      @messagePayloadBuffer = new Buffer(0)

  processPreloginResponse: ->
    preloginPayload = new PreloginPayload(@messagePayloadBuffer)
    @debug.payload(preloginPayload.toString('  '))

    @sendLogin7Packet()

  # s2.2.2.2
  createTokenStreamParser: ->
    @tokenStreamParser = new TokenStreamParser(@debug)

    @tokenStreamParser.on('loginack', (token) =>
      @loggedIn = true
    )
    @tokenStreamParser.on('infoMessage', (token) =>
      @emit('infoMessage', token)
    )
    @tokenStreamParser.on('errorMessage', (token) =>
      @activeRequest.error = token.message
      @emit('errorMessage', token)
    )
    @tokenStreamParser.on('packetSizeChange', (token) =>
      @messageIo.packetSize(token.newValue)
    )
    @tokenStreamParser.on('databaseChange', (token) =>
      @_database = token.newValue
      @emit('databaseChange', @_database)
    )
    @tokenStreamParser.on('languageChange', (token) =>
      @_language = token.newValue
      @emit('languageChange', @_language)
    )
    @tokenStreamParser.on('charsetChange', (token) =>
      @_charset = token.newValue
      @emit('charsetChange', @_charset)
    )
    @tokenStreamParser.on('columnMetadata', (token) =>
      @sqlRequest.emit('columnMetadata', token.columns)
    )
    @tokenStreamParser.on('row', (token) =>
      @sqlRequest.emit('row', token.columns)
    )
    @tokenStreamParser.on('returnStatus', (token) =>
      @procReturnStatusValue = token.value
    )
    @tokenStreamParser.on('error', (token) =>
      @fatalError(token.error)
    )
    @tokenStreamParser.on('done', (token) =>
      state = @state

      if @loggedIn
        @state = STATE.LOGGED_IN

      if state == STATE.SENT_LOGIN7
        @activeRequest.callback(@activeRequest.error, @loggedIn)
      else
        @activeRequest.callback(@activeRequest.error, token.rowCount)
    )
    @tokenStreamParser.on('doneProc', (token) =>
      @state = STATE.LOGGED_IN
      @activeRequest.callback(@activeRequest.error, @procReturnStatusValue)
      @procReturnStatusValue = undefined
    )

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
    @debug.payload(payload.toString('  '))
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

  fatalError: (message) ->
    @debug.log("FATAL ERROR: #{message}")
    @close()
    @emit('fatal', message)

  database: ->
    @_database

  language: ->
    @_language

  charset: ->
    @_charset

  close: ->
    @connection.end()
    @state = STATE.FINAL

module.exports = Connection
