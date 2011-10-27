require('buffertools')
EventEmitter = require('events').EventEmitter
TYPE = require('./token').TYPE

tokenParsers = {}
tokenParsers[TYPE.ENVCHANGE] = require('./env-change-parser')

class Parser extends EventEmitter
  constructor: () ->
    @buffer = new Buffer(0)
    @position = 0

  addBuffer: (buffer) ->
    @buffer = new Buffer(@buffer.concat(buffer))

    while @nextToken()
      'NOOP'

  nextToken: ->
    type = @buffer.readUInt8(@position)
    @position++

    if tokenParsers[type]
      token = tokenParsers[type](@buffer, @position)
      if token
        @position += token.length
      else
        false
      
    else
      console.log("Unknown token type #{type}")
      false

    false

exports.Parser = Parser
