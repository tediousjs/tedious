require('buffertools')
EventEmitter = require('events').EventEmitter
TYPE = require('./token').TYPE

tokenParsers = {}
tokenParsers[TYPE.ENVCHANGE] = require('./env-change-token-parser')
tokenParsers[TYPE.INFO] = require('./infoerror-token-parser').infoParser
tokenParsers[TYPE.ERROR] = require('./infoerror-token-parser').errorParser

###
  Buffers are thrown at the parser (by calling addBuffer).
  Tokens are parsed from the buffer until there are no more tokens in 
  the buffer, or there is just a partial token left.
  If there is a partial token left over, then it is kept until another
  buffer is added, which should contain the remainder of the partial
  token, along with (perhaps) more tokens.
  The partial token and the new buffer are concatenated, and the token
  parsing resumes.
###
class Parser extends EventEmitter
  constructor: () ->
    @buffer = new Buffer(0)
    @position = 0

  addBuffer: (buffer) ->
    @buffer = new Buffer(@buffer.concat(buffer))

    while @nextToken()
      'NOOP'

    @buffer = @buffer.slice(@position)

  end: ->
    @buffer.length == 0

  nextToken: ->
    if @position >= @buffer.length
      return false

    type = @buffer.readUInt8(@position)

    if tokenParsers[type]
      token = tokenParsers[type](@buffer, @position + 1)
      if token
        if !token.error
          #console.log(token)
          @position += 1 + token.length

          if token.event
            @emit(token.event, token)

          true
        else
          console.log(token.error)
          false
      else
        false
      
    else
      console.log("Unknown token type #{type} at offet #{@position}")
      false

exports.Parser = Parser
