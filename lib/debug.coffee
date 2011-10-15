

class Debug
  constructor: (@connection) ->
    @indent = '  '

  packet: (direction, packet) ->
    @log(direction)
    @log(packet.headerToString(@indent))

  data: (packet) ->
    @log(packet.dataToString(@indent))

  payload: (payload) ->
    @log(payload)

  log: (text) ->
    if @connection.listeners('debug').length > 0
      if !@connection.closed
        @connection.emit('debug', text)

module.exports = Debug
