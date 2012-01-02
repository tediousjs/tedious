Socket = require('net').Socket

KEEP_ALIVE_INITIAL_DELAY = 30 * 1000
CONNECT_TIMEOUT_DEFAULT = 15 * 1000
CLIENT_REQUEST_TIMEOUT_DEFAULT = 15 * 1000
CANCEL_TIMEOUT_DEFAULT = 5 * 1000

connectionStateMachine = (fire, client, config) ->
  # Used in diagram.
  @name = 'Connection - State Machine'

  socket = undefined
  connectTimer = undefined

  @defaults =
    actions:
      'connectTimeout': ->
        client.emit('connection', "timeout : failed to connect in #{config.options.connectTimeout}ms")

        'Final'

  @startState = 'Connecting'

  @states =
    Connecting:
      entry: ->
        defaultConfig()
        connect()
        socket.on('error', (error) ->
          # Need this handler, or else the error action is not fired. Weird.
        )
        connectTimer = setTimeout(fire.$cb('connectTimeout'), config.options.connectTimeout);

        fire.$regEmitter('socket', socket, true);

        null

      actions:
        'socket.connect': ->
          'SentPrelogin'

        'socket.error': ->
          client.emit('connection', "failed to connect")

          'Final'

        #'socket.error': '@error'

    SentPrelogin:
      entry: ->
        if connectTimer
          clearTimeout(connectTimer)
        client.emit('connection')

        'Final'

      actions:
        '.done': 'SentLogin7WithStandardLogin'
        '.err': 'Final'

    ###
    SentTlsNegotiation:
      entry: ->
        console.log('sent tls neg')
    ###

    SentLogin7WithStandardLogin:
      entry: ->
        console.log('sent l7 with standard login')
        null

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
        if connectTimer
          clearTimeout(connectTimer)

        if socket
          socket.destroy()

         client.emit('end')

        '@exit'

  defaultConfig = ->
    config.options ||= {}
    config.options.port ||= 1433
    config.options.connectTimeout ||= CONNECT_TIMEOUT_DEFAULT
    config.options.requestTimeout ||= CLIENT_REQUEST_TIMEOUT_DEFAULT
    config.options.cancelTimeout ||= CANCEL_TIMEOUT_DEFAULT

  connect = ->
    socket = new Socket({})
    socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY)
    socket.connect(config.options.port, config.server)

module.exports = connectionStateMachine
