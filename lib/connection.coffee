EventEmitter = require('events').EventEmitter
Socket = require('net').Socket

class Connection extends EventEmitter
  constructor: (@server, @userName, @password, @options, callback) ->
    @options.port |= 1433

    @connection = new Socket({})
    @connection.setTimeout(1000)
    @connection.connect(@options.port, @server)
  
    @connection.addListener('connect', =>
      #console.log(@connection)
      callback(undefined, true)
    )

    @connection.addListener('close', @eventClose)
    @connection.addListener('data', @eventData)
    @connection.addListener('end', @eventEnd)
    @connection.addListener('error', @eventError)
    @connection.addListener('timeout', @eventTimeout)
    #console.log(@connection)

  eventClose: (hadError) =>
    console.log('close', hadError)

  eventData: (data) =>
    console.log('data', data)

  eventEnd: =>
    console.log('end')

  eventError: (exception) =>
    console.log('error', exception)

  eventTimeout: =>
    console.log('timeout')
    @connection.end()

module.exports = Connection
