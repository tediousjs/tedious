Socket = require('net').Socket
Debug = require('../debug')
TYPE = require('../packet').TYPE
PreloginPayload = require('../prelogin-payload')
Login7Payload = require('../login7-payload')
MessageIO = require('../message-io')
TokenStreamParser = require('../token/token-stream-parser').Parser

KEEP_ALIVE_INITIAL_DELAY = 30 * 1000
DEFAULT_CONNECT_TIMEOUT = 15 * 1000
DEFAULT_CLIENT_REQUEST_TIMEOUT = 15 * 1000
DEFAULT_CANCEL_TIMEOUT = 5 * 1000
DEFAULT_PACKET_SIZE = 4 * 1024

connectionStateMachine = (fire, client, config) ->
  # Used in diagram.
  @name = 'Connection - State Machine'

  # All global connection state is mantained in this object.
  connection =
    packetSize: DEFAULT_PACKET_SIZE

  @startState = 'Connecting'

  @defaults =
    actions:
      'tokenStream.infoMessage': (token) ->
        client.emit('infoMessage', token)
        null

      'tokenStream.errorMessage': (token) ->
        client.emit('errorMessage', token)
        null

  @states =
    Connecting:
      entry: ->
        defaultConfig()
        createDebug()
        createTokenStreamParser()
        connect()
        createConnectTimer()

        fire.$regEmitter('socket', connection.socket, true);
        fire.$regEmitter('messageIo', connection.messageIo, true);
        fire.$regEmitter('tokenStream', connection.tokenStreamParser, true);

        null

      actions:
        'socket.connect': ->
          sendPreLogin()
          'SentPrelogin'

        'socket.error': ->
          client.emit('connection', "failed to connect")
          'Final'

        'connectTimeout': ->
          connectTimeout()
          'Final'

        #'socket.error': '@error'

    SentPrelogin: ->
      responseBuffer = new Buffer(0)

      entry: ->
        # TODO move these 2 lines to the state where connection establishment really finished
        clearConnectTimer()
        client.emit('connection')

        null

      actions:
        'connectTimeout': ->
          connectTimeout()
          'Final'

        'messageIo.packet': (packet) ->
          responseBuffer = responseBuffer.concat(packet.data())
          null

        'messageIo.message': ->
          preloginPayload = new PreloginPayload(responseBuffer)
          connection.debug.payload(preloginPayload.toString('  '))

          sendLogin7Packet()
          'SentLogin7WithStandardLogin'

    ###
    SentTlsNegotiation:
      entry: ->
        console.log('sent tls neg')
    ###

    SentLogin7WithStandardLogin:
      entry: ->
        console.log('sent l7 with standard login')
        null

      actions:
        'connectTimeout': ->
          connectTimeout()
          'Final'

        'messageIo.packet': (packet) ->
          connection.tokenStreamParser.addBuffer(packet.data())
          null

        'messageIo.message': ->
          'LoggedIn'

    LoggedIn:
      entry: ->
        console.log('logged in')

    ###
    SentLogin7WithSpNego:
      entry: ->
        console.log('sent l7 with spnego')

    SentClientRequest:
      entry: ->
        console.log('sent client request')

    SentAttention:
      entry: ->
        console.log('sent attention')

    RoutingComplete:
      entry: ->
        console.log('routing complete')
    ###

    Final:
      entry: ->
        clearConnectTimer()

        if connection.socket
          connection.socket.destroy()

        client.emit('end')

        '@exit'

  defaultConfig = ->
    config.options ||= {}
    config.options.port ||= 1433
    config.options.connectTimeout ||= DEFAULT_CONNECT_TIMEOUT
    config.options.requestTimeout ||= DEFAULT_CLIENT_REQUEST_TIMEOUT
    config.options.cancelTimeout ||= DEFAULT_CANCEL_TIMEOUT

  createDebug = ->
    connection.debug = new Debug(config.options.debug)
    connection.debug.on('debug', (message) ->
      client.emit('debug', message)
    )

  createTokenStreamParser = ->
    connection.tokenStreamParser = new TokenStreamParser(connection.debug)

  connect = ->
    connection.socket = new Socket({})
    connection.socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY)
    connection.socket.connect(config.options.port, config.server)

    connection.socket.on('error', (error) ->
      # Need this listener, or else the error actions are not fired. Weird.
    )

    connection.messageIo = new MessageIO(connection.socket, connection.packetSize, connection.debug)

  createConnectTimer = ->
    connection.connectTimer = setTimeout(fire.$cb('connectTimeout'), config.options.connectTimeout)

  connectTimeout = ->
    client.emit('connection', "timeout : failed to connect in #{config.options.connectTimeout}ms")

  clearConnectTimer = ->
    if connection.connectTimer
      clearTimeout(connection.connectTimer)

  sendPreLogin = ->
    payload = new PreloginPayload()
    connection.messageIo.sendMessage(TYPE.PRELOGIN, payload.data)
    connection.debug.payload(payload.toString('  '))

  sendLogin7Packet = ->
    loginData =
      userName: config.userName
      password: config.password
      database: config.options.database

    payload = new Login7Payload(loginData)
    connection.messageIo.sendMessage(TYPE.LOGIN7, payload.data)
    connection.debug.payload(payload.toString('  '))

module.exports = connectionStateMachine
