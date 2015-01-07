Dissolve = require("dissolve")

TYPE = require('../token').TYPE

tokenParsers = {}
tokenParsers[TYPE.COLMETADATA] = require('./colmetadata-token-parser')
tokenParsers[TYPE.DONE] = require('./done-token-parser')
tokenParsers[TYPE.DONEINPROC] = require('./done-token-parser')
tokenParsers[TYPE.DONEPROC] = require('./done-token-parser')
tokenParsers[TYPE.ENVCHANGE] = require('./env-change-token-parser')
tokenParsers[TYPE.ERROR] = require('./infoerror-token-parser')
tokenParsers[TYPE.INFO] = require('./infoerror-token-parser')
tokenParsers[TYPE.LOGINACK] = require('./loginack-token-parser')
tokenParsers[TYPE.ORDER] = require('./order-token-parser')
tokenParsers[TYPE.RETURNSTATUS] = require('./returnstatus-token-parser')
tokenParsers[TYPE.RETURNVALUE] = require('./returnvalue-token-parser')
tokenParsers[TYPE.ROW] = require('./row-token-parser')
tokenParsers[TYPE.NBCROW] = require('./nbcrow-token-parser')
tokenParsers[TYPE.SSPI] = require('./sspi-token-parser')

module.exports = class Parser extends Dissolve
  constructor: (@debug, @colMetadata, @options) ->
    super()

    @loop ->
      @vars = Object.create(null)

      @uint8("type")
      @tap ->
        if tokenParsers[@vars.type]
          tokenParsers[@vars.type].call(@)
        else
          throw new Error("Token type #{@vars.type} not implemented")

  # Read a Unicode String (BVARCHAR)
  bVarchar: (name) ->
    len = "__#{name}_len"

    @uint8(len).tap ->
      @buffer(name, @vars[len] * 2).tap ->
        delete @vars[len]
        @vars[name] = @vars[name].toString("ucs2")

  # Read a Unicode String (USVARCHAR)
  usVarchar: (name) ->
    len = "__#{name}_len"

    @uint16le(len).tap ->
      @buffer(name, @vars[len] * 2).tap ->
        delete @vars[len]
        @vars[name] = @vars[name].toString("ucs2")

  # Read binary data (BVARBYTE)
  bVarbyte: (name) ->
    len = "__#{name}_len"

    @uint8(len).tap ->
      @buffer(name, @vars[len]).tap ->
        delete @vars[len]

  uint24le: (name) ->
    low = "__#{name}_low"
    high = "__#{name}_high"

    @uint16(low).uint8(high).tap ->
      @vars[name] = @vars[low] | (@vars[high] << 16)
      delete @vars[low]
      delete @vars[high]

  uint40le: (name) ->
    low = "__#{name}_low"
    high = "__#{name}_high"

    @uint32le(low).uint8(high).tap ->
      @vars[name] = (0x100000000 * @vars[high]) + @vars[low]
      delete @vars[low]
      delete @vars[high]

  unumeric64le: (name) ->
    low = "__#{name}_low"
    high = "__#{name}_high"

    @uint32le(low).uint32le(high).tap ->
      @vars[name] = (0x100000000 * @vars[high]) + @vars[low]
      delete @vars[low]
      delete @vars[high]

  unumeric96le: (name) ->
    dword1 = "__#{name}_dword1"
    dword2 = "__#{name}_dword2"
    dword3 = "__#{name}_dword3"

    @uint32le(dword1).uint32le(dword2).uint32le(dword3).tap ->
      @vars[name] = @vars[dword1] + (0x100000000 * @vars[dword2]) + (0x100000000 * 0x100000000 * @vars[dword3])

      delete @vars[dword1]
      delete @vars[dword2]
      delete @vars[dword3]

  unumeric128le: (name) ->
    dword1 = "__#{name}_dword1"
    dword2 = "__#{name}_dword2"
    dword3 = "__#{name}_dword3"
    dword4 = "__#{name}_dword4"

    @uint32le(dword1).uint32le(dword2).uint32le(dword3).uint32le(dword4).tap ->
      @vars[name] = @vars[dword1] + (0x100000000 * @vars[dword2]) + (0x100000000 * 0x100000000 * @vars[dword3]) + (0x100000000 * 0x100000000 * 0x100000000 * @vars[dword4])

      delete @vars[dword1]
      delete @vars[dword2]
      delete @vars[dword3]
      delete @vars[dword4]
