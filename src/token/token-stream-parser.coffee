async = require('async')
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
tokenParsers[TYPE.ORDER] = require('./order-token-parser')
tokenParsers[TYPE.RETURNSTATUS] = require('./returnstatus-token-parser')
tokenParsers[TYPE.RETURNVALUE] = require('./returnvalue-token-parser')
tokenParsers[TYPE.ROW] = require('./row-token-parser')

class Parser extends EventEmitter
  constructor: (@debug, @buffer, @callback) ->
    @done = false
    @colMetadata = undefined

    async.whilst(
      =>
        !@done

      ,@nextToken

      , =>
        @callback()
    )

  nextToken: (callback) =>
    @buffer.readUInt8((type) =>
      if tokenParsers[type]
        if type == TYPE.ROW
          tokenParsers[type](@buffer, @colMetadata, (token) =>
            @postParse(token)
            callback()
          )
        else
          tokenParsers[type](@buffer, (token) =>
            @postParse(token)
            callback()
          )
      else
        throw new Error("Unrecognised token #{type} at offset #{@buffer.position}")
    )

  postParse: (token) =>
    @debug.token(token)

    if token.event
      @emit(token.event, token)

    switch token.name
      when 'COLMETADATA'
        @colMetadata = token.columns
      when 'DONE', 'DONEINPROC', 'DONEPROC'
        @done = !token.more

exports.Parser = Parser
