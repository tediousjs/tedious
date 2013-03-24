require('./buffertools')
sprintf = require('sprintf').sprintf

HEADER_LENGTH = 8

TYPE =
  SQL_BATCH: 0x01
  RPC_REQUEST: 0x03
  TABULAR_RESULT: 0x04
  TRANSACTION_MANAGER: 0x0E
  LOGIN7: 0x10
  PRELOGIN: 0x12

typeByValue = {}
for name, value of TYPE
  typeByValue[value] = name

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
DEFAULT_PACKETID = 1;
DEFAULT_WINDOW = 0;

NL = '\n'

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

  resetConnection: (reset) ->
    status = @buffer.readUInt8(OFFSET.Status)

    if reset
      status |= STATUS.RESETCONNECTION
    else
      status &= 0xFF - STATUS.RESETCONNECTION

    @buffer.writeUInt8(status, OFFSET.Status)

  last: (last) ->
    status = @buffer.readUInt8(OFFSET.Status)

    if arguments.length > 0
      if last
        status |= STATUS.EOM
      else
        status &= 0xFF - STATUS.EOM

      @buffer.writeUInt8(status, OFFSET.Status)

    @isLast()

  isLast: ->
    !!(@buffer.readUInt8(OFFSET.Status) & STATUS.EOM)

  packetId: (packetId) ->
    if packetId
      @buffer.writeUInt8(packetId % 256, OFFSET.PacketID)

    @buffer.readUInt8(OFFSET.PacketID)

  addData: (data) ->
    @buffer = Buffer.concat([@buffer, data])
    @setLength()
    @

  data: ->
    @buffer.slice(HEADER_LENGTH)

  type: ->
    @buffer.readUInt8(OFFSET.Type)

  statusAsString: ->
    status = @buffer.readUInt8(OFFSET.Status)
    statuses = for name, value of STATUS
      if status & value
        name
    statuses.join(' ').trim()

  headerToString: (indent) ->
    indent ||= ''

    text = sprintf('type:0x%02X(%s), status:0x%02X(%s), length:0x%04X, spid:0x%04X, packetId:0x%02X, window:0x%02X',
      @buffer.readUInt8(OFFSET.Type), typeByValue[@buffer.readUInt8(OFFSET.Type)],
      @buffer.readUInt8(OFFSET.Status), @statusAsString(),
      @buffer.readUInt16BE(OFFSET.Length),
      @buffer.readUInt16BE(OFFSET.SPID),
      @buffer.readUInt8(OFFSET.PacketID),
      @buffer.readUInt8(OFFSET.Window)
    )

    indent + text

  dataToString: (indent) ->
    BYTES_PER_GROUP = 0x04
    CHARS_PER_GROUP = 0x08
    BYTES_PER_LINE = 0x20

    indent ||= ''

    data = @data()
    dataDump = ''
    chars = ''

    for offset in [0..data.length - 1]
      if offset % BYTES_PER_LINE == 0
        dataDump += indent;
        dataDump += sprintf('%04X  ', offset);

      if data[offset] < 0x20 || data[offset] > 0x7E
        chars += '.'

        if ((offset + 1) % CHARS_PER_GROUP == 0) && !((offset + 1) % BYTES_PER_LINE == 0)
          chars += ' '
      else
        chars += String.fromCharCode(data[offset])

      dataDump += sprintf('%02X', data[offset]);

      if ((offset + 1) % BYTES_PER_GROUP == 0) && !((offset + 1) % BYTES_PER_LINE == 0)
        # Inter-group space.
        dataDump += ' '

      if (offset + 1) % BYTES_PER_LINE == 0
        dataDump += '  ' + chars
        chars = ''

        if offset < data.length - 1
          dataDump += NL;

    if chars.length
      dataDump += '  ' + chars

    dataDump

  toString: (indent) ->
    indent ||= ''

    @headerToString(indent) + '\n' + @dataToString(indent + indent)

  payloadString: (indent) ->
    ""

isPacketComplete = (potentialPacketBuffer) ->
  if potentialPacketBuffer.length < HEADER_LENGTH
    false
  else
    potentialPacketBuffer.length >= potentialPacketBuffer.readUInt16BE(OFFSET.Length);

packetLength = (potentialPacketBuffer) ->
  potentialPacketBuffer.readUInt16BE(OFFSET.Length)

exports.Packet = Packet
exports.OFFSET = OFFSET
exports.TYPE = TYPE
exports.isPacketComplete = isPacketComplete
exports.packetLength = packetLength
exports.HEADER_LENGTH = HEADER_LENGTH
