StreamParser = require("../stream-parser")

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
tokenParsers[TYPE.NBCROW] = require('./nbcrow-token-parser')
tokenParsers[TYPE.SSPI] = require('./sspi-token-parser')

module.exports = class Parser extends StreamParser
  constructor: (@debug, @colMetadata, @options) ->
    super()

  parser: ->
    while true
      type = yield @readUInt8()

      if tokenParsers[type]
        token = yield from tokenParsers[type](@, @colMetadata, @options)

        if token
          switch token.name
            when 'COLMETADATA'
              @colMetadata = token.columns

          @push(token)
      else
        throw new Error("Token type #{type} not implemented")

    undefined

  # Read a Unicode String (BVARCHAR)
  readBVarChar: (name) ->
    length = yield @readUInt8()
    data = yield @readBuffer(length * 2)
    data.toString("ucs2")

  # Read a Unicode String (USVARCHAR)
  readUsVarChar: (name) ->
    length = yield @readUInt16LE()
    data = yield @readBuffer(length * 2)
    data.toString("ucs2")

  # Read binary data (BVARBYTE)
  readBVarByte: (name) ->
    length = yield @readUInt8()
    yield @readBuffer(length)

  # Read binary data (USVARCHAR)
  readUsVarByte: (name) ->
    length = yield @readUInt16LE()
    yield @readBuffer(length)

  readUInt24LE: (name) ->
    low = yield @readUInt16LE()
    high = yield @readUInt8()
    low | (high << 16)

  readUInt40LE: (name) ->
    low = yield @readUInt32LE()
    high = yield @readUInt8()
    (0x100000000 * high) + low

  readUNumeric64LE: (name) ->
    low = yield @readUInt32LE()
    high = yield @readUInt32LE()
    (0x100000000 * high) + low

  readUNumeric96LE: (name) ->
    dword1 = yield @readUInt32LE()
    dword2 = yield @readUInt32LE()
    dword3 = yield @readUInt32LE()
    dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3)

  readUNumeric128LE: (name) ->
    dword1 = yield @readUInt32LE()
    dword2 = yield @readUInt32LE()
    dword3 = yield @readUInt32LE()
    dword4 = yield @readUInt32LE()

    dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3) + (0x100000000 * 0x100000000 * 0x100000000 * dword4)
