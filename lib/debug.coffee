

class Debug
  ###
    @emmiter    Object on which to emit debug messages.
    @isActiver  Function to call to test whether the emitter still
                wants messages to be logged.
    @options    Which debug details should be sent.
                  data    - dump of packet data
                  payload - details of decoded payload
  ###
  constructor: (@emitter, @isEmitterActive, @options) ->
    @options = @options || {}
    @options.data = @options.data || false
    @options.payload = @options.payload || false

    @indent = '  '

  packet: (direction, packet) ->
    if @isActive()
      @log('')
      @log(direction)
      @log(packet.headerToString(@indent))

  data: (packet) ->
    if @isActive() && @options.data
      @log(packet.dataToString(@indent))

  payload: (payload) ->
    if @isActive() && @options.payload
      @log(payload)

  isActive: ->
    @isEmitterActive() && @emitter.listeners('debug').length > 0

  log: (text) ->
    @emitter.emit('debug', text)

module.exports = Debug
