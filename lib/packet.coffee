require('buffertools')

HEADER_LENGTH = 8

TYPE =
  RPC_REQUEST: 0x03,
  TABULAR_RESULT: 0x04,
  LOGIN7: 0x10,
  PRELOGIN: 0x12

STATUS =
  NORMAL: 0x00,
  EOM: 0x01,                      # End Of Message (last packet).
  IGNORE: 0x02,                   # EOM must also be set.
  RESETCONNECTION: 0x08,
  RESETCONNECTIONSKIPTRAN: 0x10

OFFSET =
  Type: 0,
  Status: 1,
  Length: 2,
  SPID: 4,
  PacketID: 6,
  Window: 7

DEFAULT_SPID = 0;
DEFAULT_PACKETID = 0;
DEFAULT_WINDOW = 0;

class Packet
  constructor: (typeOrBuffer) ->
    if typeOrBuffer instanceof Buffer
      @buffer = typeOrBuffer
    else
      type = typeOrBuffer

      @buffer = new Buffer(HEADER_LENGTH)

      @buffer.writeUInt8(type, OFFSET.Type)
      @buffer.writeUInt8(STATUS.NORMAL, OFFSET.Status)
      @buffer.writeUInt16BE(DEFAULT_SPID, OFFSET.SPID)
      @buffer.writeUInt8(DEFAULT_PACKETID, OFFSET.PacketID)
      @buffer.writeUInt8(DEFAULT_WINDOW, OFFSET.Window)

      @setLength()

  setLength: ->
    @buffer.writeUInt16BE(@buffer.length, OFFSET.Length)

  length: ->
    @buffer.readUInt16BE(OFFSET.Length)

  setLast: ->
    status = @buffer.readUInt8(OFFSET.Status) | STATUS.EOM
    @buffer.writeUInt8(status, OFFSET.Status)
    @

  isLast: ->
    @buffer.readUInt8(OFFSET.Status) & STATUS.EOM

  addData: (data) ->
    @buffer = new Buffer(@buffer.concat(data))
    @setLength()
    @

  data: ->
    @buffer.slice(HEADER_LENGTH)

exports.Packet = Packet
exports.TYPE = TYPE
