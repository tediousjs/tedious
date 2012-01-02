connectionStateMachine = (fire) ->
  @name = 'Connection - State Machine'

  @startState = 'Initial'

  @states =
    Initial:
      entry: ->
        console.log('init')
        'SentPrelogin'

    SentPrelogin:
      entry: ->
        console.log('sent pl')
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

module.exports = connectionStateMachine;
