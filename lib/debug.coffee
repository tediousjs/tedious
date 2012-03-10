EventEmitter = require('events').EventEmitter
util = require('util')

class Debug extends EventEmitter
  ###
    @options    Which debug details should be sent.
                  data    - dump of packet data
                  payload - details of decoded payload
  ###
  constructor: (@options) ->
    @options = @options || {}
    @options.data = @options.data || false
    @options.payload = @options.payload || false
    @options.packet = @options.packet || false
    @options.token = @options.token || false

    @indent = '  '

  packet: (direction, packet) ->
    if @haveListeners() && @options.packet
      @log('')
      @log(direction)
      @log(packet.headerToString(@indent))

  data: (packet) ->
    if @haveListeners() && @options.data
      @log(packet.dataToString(@indent))

  payload: (generatePayloadText) ->
    if @haveListeners() && @options.payload
      @log(generatePayloadText())

  token: (token) ->
    if @haveListeners() && @options.token
      @log(util.inspect(token, false, 5, true))

  # Only incur the overhead of producing formatted messages when necessary.
  haveListeners: ->
    @listeners('debug').length > 0

  log: (text) ->
    @emit('debug', text)

module.exports = Debug
