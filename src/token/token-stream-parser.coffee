EventEmitter = require('events').EventEmitter
StreamParser = require("./stream-parser")

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
  constructor: (@debug, @colMetadata, @options) ->
    @parser = new StreamParser(@debug, @colMetadata, @options)

    @parser.on "data", (token) =>
      if token.event
        @emit(token.event, token)

  addBuffer: (buffer) ->
    @parser.write(buffer)

  isEnd: () ->
    @parser.buffer.length == 0

exports.Parser = Parser
