EventEmitter = require('events').EventEmitter
ignite = require('ignite')
connectionGF = require('../../lib/connection/connection-statemachine')

class Connection extends EventEmitter
  constructor: (@config) ->
    imports = {}
    options = {}

    if @config?.statemachine?.logLevel
      options.logLevel = @config.statemachine.logLevel

    factory = new ignite.Factory(connectionGF, imports, options)
    factory.spawn(@, @config)

module.exports = Connection
