Socket = require('net').Socket
Debug = require('../debug')
TYPE = require('../packet').TYPE
PreloginPayload = require('../prelogin-payload')
Login7Payload = require('../login7-payload')
MessageIO = require('../message-io')

KEEP_ALIVE_INITIAL_DELAY = 30 * 1000
DEFAULT_CONNECT_TIMEOUT = 15 * 1000
DEFAULT_CLIENT_REQUEST_TIMEOUT = 15 * 1000
DEFAULT_CANCEL_TIMEOUT = 5 * 1000
DEFAULT_PACKET_SIZE = 4 * 1024

connectionStateMachine = (fire, client, config) ->
  # Used in diagram.
  @name = 'Connection - State Machine'

  state =
    packetSize: DEFAULT_PACKET_SIZE

  #socket = undefined
  #messageIo = undefined
  #debug = undefined
  #connectTimer = undefined
  #packetSize = DEFAULT_PACKET_SIZE

  @startState = 'Connecting'

  @states =
    Connecting:
      entry: ->
        defaultConfig()
        createDebug()
        connect()
        state.connectTimer = setTimeout(fire.$cb('connectTimeout'), config.options.connectTimeout);

        fire.$regEmitter('socket', state.socket, true);

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

        #'socket.error': '@error'

    SentPrelogin:
      entry: ->
        clearConnectTimer()
        client.emit('connection')

        null#'Final'

      actions:
        '.done': 'SentLogin7WithStandardLogin'
        '.err': 'Final'
        'connectTimeout': ->
          connectTimeout()

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

    ###
    SentLogin7WithSpNego:
      entry: ->
        console.log('sent l7 with spnego')

    LoggedIn:
      entry: ->
        console.log('logged in')

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

        if state.socket
          state.socket.destroy()

        client.emit('end')

        '@exit'

  defaultConfig = ->
    config.options ||= {}
    config.options.port ||= 1433
    config.options.connectTimeout ||= DEFAULT_CONNECT_TIMEOUT
    config.options.requestTimeout ||= DEFAULT_CLIENT_REQUEST_TIMEOUT
    config.options.cancelTimeout ||= DEFAULT_CANCEL_TIMEOUT

  createDebug = ->
    state.debug = new Debug(config.options.debug)
    state.debug.on('debug', (message) ->
      client.emit('debug', message)
    )

  connect = ->
    state.socket = new Socket({})
    state.socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY)
    state.socket.connect(config.options.port, config.server)

    state.socket.on('error', (error) ->
      # Need this listener, or else the error actions are not fired. Weird.
    )

    state.messageIo = new MessageIO(state.socket, state.packetSize, state.debug)

  connectTimeout = ->
    client.emit('connection', "timeout : failed to connect in #{config.options.connectTimeout}ms")
    'Final'

  clearConnectTimer = ->
    if state.connectTimer
      clearTimeout(state.connectTimer)

  sendPreLogin = ->
    payload = new PreloginPayload()
    state.messageIo.sendMessage(TYPE.PRELOGIN, payload)
    #state.debug.payload(payload.toString('  '))

module.exports = connectionStateMachine
