Socket = require('net').Socket

KEEP_ALIVE_INITIAL_DELAY = 30 * 1000
CONNECT_TIMEOUT_DEFAULT = 15 * 1000
CLIENT_REQUEST_TIMEOUT_DEFAULT = 15 * 1000
CANCEL_TIMEOUT_DEFAULT = 5 * 1000

connectionStateMachine = (fire, config) ->
  # Used in diagram.
  @name = 'Connection - State Machine'

  connection = undefined
  connectTimer = undefined

  @defaults =
    actions:
      'connectTimeout': ->
        console.log 'connect timeout'
        if connection
          connection.destroy()

        'Final'

  @startState = 'Connecting'

  @states =
    Connecting:
      entry: ->
        defaultConfig()
        connectTimer = setTimeout(fire.$cb('connectTimeout'), config.options.connectTimeout);
        connection = connect()
        fire.$regEmitter('connection', connection, true);

        null

      actions:
        'connection.connect': ->
          'SentPrelogin'

        'connection.error': '@error'

    SentPrelogin:
      entry: ->
        if connectTimer
          clearTimeout(connectTimer)

        null

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
        console.log('done')
        '@exit'

  defaultConfig = ->
    config.options ||= {}
    config.options.port ||= 1433
    config.options.connectTimeout ||= CONNECT_TIMEOUT_DEFAULT
    config.options.requestTimeout ||= CLIENT_REQUEST_TIMEOUT_DEFAULT
    config.options.cancelTimeout ||= CANCEL_TIMEOUT_DEFAULT

  connect = ->
    connection = new Socket({})
    connection.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY)
    connection.connect(config.options.port, config.server)

    connection

module.exports = connectionStateMachine
