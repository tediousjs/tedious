EventEmitter = require('events').EventEmitter
ignite = require('ignite')
connectionGF = require('../../lib/connection/connection-statemachine')

class ConnectionFactory
  constructor: () ->
    imports = {}
    options =
      logLevel: require('../tedious').statemachineLogLevel

    @factory = new ignite.Factory(connectionGF, imports, options)

  createConnection: (config) ->
    new Connection(@factory, config)

class Connection extends EventEmitter
  constructor: (factory, config) ->
    factory.spawn(@, config)

  close: ->
    @emit('close')

module.exports = ConnectionFactory
