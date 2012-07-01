sprintf = require('sprintf').sprintf
tediousVersion = require('./tedious').version
WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer

###
  s2.2.6.4
###

optionBufferSize = 20

VERSION = 0x000000001
SUBBUILD = 0x0001

TOKEN =
  VERSION: 0x00,
  ENCRYPTION: 0x01,
  INSTOPT: 0x02,
  THREADID: 0x03,
  MARS: 0x04,
  TERMINATOR: 0xFF

ENCRYPT =
  OFF: 0x00,
  ON: 0x01,
  NOT_SUP: 0x02,
  REQ: 0x03

encryptByValue = {}
for name, value of ENCRYPT
  encryptByValue[value] = name

MARS =
  OFF: 0x00,
  ON: 0x01

marsByValue = {}
for name, value of MARS
  marsByValue[value] = name

parsePrelogin = (buffer, callback) ->
  tokens = {}
  startPosition = buffer.bytesRead()

  nextToken = () ->
    buffer.readUInt8((tokenType) ->
      if tokenType == TOKEN.TERMINATOR
        readTokensData()
      else
        buffer.readMultiple(
          offset: buffer.readUInt16BE
          length: buffer.readUInt16BE
          , (tokenMetadata) ->
            tokenMetadata.endOfData = tokenMetadata.offset + tokenMetadata.length

            switch tokenType
              when TOKEN.VERSION
                tokens.version = tokenMetadata
              when TOKEN.ENCRYPTION
                tokens.encryption = tokenMetadata
              when TOKEN.INSTOPT
                tokens.instance = tokenMetadata
              when TOKEN.THREADID
                tokens.threadId = tokenMetadata
              when TOKEN.MARS
                tokens.mars = tokenMetadata

            nextToken()
        )
    )

  readTokensData = () ->
    buffer.readBuffer(dataBufferLength(), (tokenDataBuffer) ->
      extractVersion = ->
        tokens.version =
          major: tokenDataBuffer.readUInt8(tokens.version.offset + 0)
          minor: tokenDataBuffer.readUInt8(tokens.version.offset + 1)
          patch: tokenDataBuffer.readUInt8(tokens.version.offset + 2)
          trivial: tokenDataBuffer.readUInt8(tokens.version.offset + 3)
          subbuild: tokenDataBuffer.readUInt16BE(tokens.version.offset + 4)

      extractEncryption = ->
        tokens.encryption = tokenDataBuffer.readUInt8(tokens.encryption.offset)
        tokens.encryptionString = encryptByValue[tokens.encryption]

      extractInstance = ->
        tokens.instance = tokenDataBuffer.readUInt8(tokens.instance.offset)

      extractThreadId = ->
        if tokens.threadId.length > 0
          tokens.threadId = tokenDataBuffer.readUInt32BE(tokens.threadId.offset)
        else
          delete tokens.threadId

      extractMars = ->
        tokens.mars = tokenDataBuffer.readUInt8(tokens.mars.offset)
        tokens.marsString = marsByValue[tokens.mars]

      if tokens.version then extractVersion()
      if tokens.encryption then extractEncryption()
      if tokens.instance then extractInstance()
      if tokens.threadId then extractThreadId()
      if tokens.mars then extractMars()

      callback(new PreloginPayload(tokens))
    )

   dataBufferLength = () ->
    currentPosition = buffer.bytesRead() - startPosition
    endOfTokensData = currentPosition

    for tokenName, token of tokens
      if token.endOfData > endOfTokensData
        endOfTokensData = token.endOfData
        token.offset -= currentPosition

    endOfTokensData - currentPosition

  nextToken()

class PreloginPayload
  constructor: (tokens) ->
    if tokens
      @version = tokens.version
      @encryption = tokens.encryption
      @encryptionString = tokens.encryptionString
      @instance = tokens.instance
      @threadId = tokens.threadId
      @mars = tokens.mars
      @marsString = tokens.marsString
      buffer = tokens
      @data = buffer
    else
      @version =
        major: tediousVersion.major
        minor: tediousVersion.minor
        patch: tediousVersion.patch
        trivial: 0
        subbuild: 0
      @encryption = ENCRYPT.NOT_SUP
      @encryptionString = encryptByValue[@encryption]
      @instance = 0
      @threadId = 0
      @mars = MARS.OFF
      @marsString = marsByValue[@mars]

  toBuffer: ->
    options = [
      @createVersionOption(),
      @createEncryptionOption(),
      @createInstanceOption(),
      @createThreadIdOption(),
      @createMarsOption()
    ]

    length = 0
    for option in options
      length += 5 + option.data.length
    length++ # terminator

    @data = new Buffer(length)
    optionOffset = 0
    optionDataOffset = 5 * options.length + 1
    for option in options
      @data.writeUInt8(option.token, optionOffset + 0)
      @data.writeUInt16BE(optionDataOffset, optionOffset + 1)
      @data.writeUInt16BE(option.data.length, optionOffset + 3)
      optionOffset += 5

      option.data.copy(@data, optionDataOffset)
      optionDataOffset += option.data.length

    @data.writeUInt8(TOKEN.TERMINATOR, optionOffset)

    @data

  createVersionOption: () ->
    buffer = new WritableTrackingBuffer(optionBufferSize)
    buffer.writeUInt32BE(VERSION)
    buffer.writeUInt16BE(SUBBUILD)

    token: TOKEN.VERSION
    data: buffer.data

  createEncryptionOption: () ->
    buffer = new WritableTrackingBuffer(optionBufferSize)
    buffer.writeUInt8(ENCRYPT.NOT_SUP)

    token: TOKEN.ENCRYPTION
    data: buffer.data

  createInstanceOption: () ->
    buffer = new WritableTrackingBuffer(optionBufferSize)
    buffer.writeUInt8(0x00)

    token: TOKEN.INSTOPT
    data: buffer.data

  createThreadIdOption: () ->
    buffer = new WritableTrackingBuffer(optionBufferSize)
    buffer.writeUInt32BE(0x00)

    token: TOKEN.THREADID
    data: buffer.data

  createMarsOption: () ->
    buffer = new WritableTrackingBuffer(optionBufferSize)
    buffer.writeUInt8(MARS.OFF)

    token: TOKEN.MARS
    data: buffer.data

  toString: (indent) ->
    indent ||= ''

    console.log @
    indent + 'PreLogin - ' +
      sprintf('version:%d.%d.%d.%d %d, encryption:0x%02X(%s), instopt:0x%02X, threadId:0x%08X, mars:0x%02X(%s)',
          @version.major,
          @version.minor,
          @version.patch,
          @version.trivial,
          @version.subbuild,
          @encryption, @encryptionString,
          @instance,
          if @threadId then @threadId else 0,
          @mars, @marsString
      )

exports.PreloginPayload = PreloginPayload
exports.parsePrelogin = parsePrelogin