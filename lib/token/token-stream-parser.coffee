ReadableTrackingBuffer = require('../tracking-buffer/tracking-buffer').ReadableTrackingBuffer
EventEmitter = require('events').EventEmitter
TYPE = require('./token').TYPE

tokenParsers = {}
tokenParsers[TYPE.COLMETADATA] = require('./colmetadata-token-parser')
tokenParsers[TYPE.DONE] = require('./done-token-parser').doneParser
tokenParsers[TYPE.DONEINPROC] = require('./done-token-parser').doneInProcParser
tokenParsers[TYPE.DONEPROC] = require('./done-token-parser').doneProcParser
tokenParsers[TYPE.ENVCHANGE] = require('./env-change-token-parser')
tokenParsers[TYPE.ERROR] = require('./infoerror-token-parser').errorParser
tokenParsers[TYPE.INFO] = require('./infoerror-token-parser').infoParser
tokenParsers[TYPE.LOGINACK] = require('./loginack-token-parser')
tokenParsers[TYPE.RETURNSTATUS] = require('./returnstatus-token-parser')
tokenParsers[TYPE.ROW] = require('./row-token-parser')

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
  constructor: (@debug) ->
    @buffer = new ReadableTrackingBuffer(new Buffer(0), 'ucs2')
    @position = 0

  addBuffer: (buffer) ->
    @buffer.add(buffer)

    while @nextToken()
      'NOOP'

    @buffer.position = @position

  isEnd: ->
    @buffer.empty()

  nextToken: ->
    try
      type = @buffer.readUInt8()

      if tokenParsers[type]
        token = tokenParsers[type](@buffer, @colMetadata)

        if token
          @debug.token(token)

          if !token.error
            @position = @buffer.position

            if token.event
              @emit(token.event, token)

            switch token.name
              when 'COLMETADATA'
                @colMetadata = token.columns

            return true
          else
            @emit('error', token)
            return false
        else
          return false

      else
        return false
    catch error
      if error?.error == 'oob'
        return false
      else
        throw error

exports.Parser = Parser
