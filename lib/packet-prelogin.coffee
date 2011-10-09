assert = require('assert')
buildBuffer = require('./build-buffer')
Packet = require('./packet').Packet
sprintf = require('sprintf').sprintf
TYPE = require('./packet').TYPE

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

class PreloginPacket extends Packet
  constructor: (buffer) ->
    if buffer instanceof Buffer
      super(buffer)
    else
      super(TYPE.PRELOGIN)

      @addOptions()

    @extractOptions()

  addOptions: ->
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

    data = new Buffer(length)
    optionOffset = 0
    optionDataOffset = 5 * options.length + 1
    for option in options
      data.writeUInt8(option.token, optionOffset + 0)
      data.writeUInt16BE(optionDataOffset, optionOffset + 1)
      data.writeUInt16BE(option.data.length, optionOffset + 3)
      optionOffset += 5

      option.data.copy(data, optionDataOffset)
      optionDataOffset += option.data.length

    data.writeUInt8(TOKEN.TERMINATOR, optionOffset)

    @addData(data)

  createVersionOption: () ->
    token: TOKEN.VERSION,
    data: buildBuffer('32', VERSION, '16', SUBBUILD)

  createEncryptionOption: () ->
    token: TOKEN.ENCRYPTION,
    data: buildBuffer('8', ENCRYPT.NOT_SUP)

  createInstanceOption: () ->
    token: TOKEN.INSTOPT,
    data: buildBuffer('8', 0x00)

  createThreadIdOption: () ->
    token: TOKEN.THREADID,
    data: buildBuffer('32', 0x00)

  createMarsOption: () ->
    token: TOKEN.MARS,
    data: buildBuffer('8', MARS.OFF)

  extractOptions: ->
    data = @data()

    offset = 0;
    while data[offset] != TOKEN.TERMINATOR
      dataOffset = data.readUInt16BE(offset + 1)
      dataLength = data.readUInt16BE(offset + 3)

      switch data[offset]
        when TOKEN.VERSION
          @extractVersion(data, dataOffset)
        when TOKEN.ENCRYPTION
          @extractEncryption(data, dataOffset)
        when TOKEN.INSTOPT
          @extractInstance(data, dataOffset)
        when TOKEN.THREADID
          @extractThreadId(data, dataOffset)
        when TOKEN.MARS
          @extractMars(data, dataOffset)

      offset += 5
      dataOffset += dataLength

  extractVersion: (data, offset) ->
    @version =
      major: data.readUInt8(offset + 0),
      minor: data.readUInt8(offset + 1),
      patch: data.readUInt8(offset + 2),
      trivial: data.readUInt8(offset + 3),
      subbuild: data.readUInt16BE(offset + 4)

  extractEncryption: (data, offset) ->
    @encryption = data.readUInt8(offset)
    @encryptionString = encryptByValue[@encryption]

  extractInstance: (data, offset) ->
    @instance = data.readUInt8(offset)

  extractThreadId: (data, offset) ->
    @threadId = data.readUInt32BE(offset)

  extractMars: (data, offset) ->
    @mars = data.readUInt8(offset)
    @marsString = marsByValue[@mars]

  payloadString: (indent) ->
    indent ||= ''

    indent + 'PreLogin - ' +
      sprintf('version:%d.%d.%d.%d %d, encryption:0x%02X(%s), instopt:0x%02X, threadId:0x%08X, mars:0x%02X(%s)',
          @version.major,
          @version.minor,
          @version.patch,
          @version.trivial,
          @version.subbuild,
          @encryption, @encryptionString,
          @instance,
          @threadId,
          @mars, @marsString
      )

exports.PreloginPacket = PreloginPacket
