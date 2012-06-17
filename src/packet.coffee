require('./buffertools')
sprintf = require('sprintf').sprintf

HEADER_LENGTH = 8

TYPE =
  SQL_BATCH: 0x01
  RPC_REQUEST: 0x03
  TABULAR_RESULT: 0x04
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

decodeHeader = (buffer) ->
  header =
    type: buffer.readUInt8(OFFSET.Type)
    status: buffer.readUInt8(OFFSET.Status)
    length: buffer.readUInt16BE(OFFSET.Length)
    spid: buffer.readUInt16BE(OFFSET.SPID)
    packetId: buffer.readUInt8(OFFSET.PacketID)
    window: buffer.readUInt8(OFFSET.Window)

  header.endOfMessage = !!(header.status & STATUS.EOM)
  header.payloadLength = header.length - HEADER_LENGTH

  header

encodeHeader = (type, status, payloadLength, packetId) ->
  buffer = new Buffer(HEADER_LENGTH)

  buffer.writeUInt8(type, OFFSET.Type)
  buffer.writeUInt8(status, OFFSET.Status)
  buffer.writeUInt16BE(HEADER_LENGTH + payloadLength, OFFSET.Length)
  buffer.writeUInt16BE(DEFAULT_SPID, OFFSET.SPID)
  buffer.writeUInt8(packetId % 0x100, OFFSET.PacketID)
  buffer.writeUInt8(DEFAULT_WINDOW, OFFSET.Window)

  buffer

headerToString = (header, indent) ->
  indent ||= ''

  text = sprintf('type:0x%02X(%s), status:0x%02X(%s), length:0x%04X, spid:0x%04X, packetId:0x%02X, window:0x%02X',
    header.type, typeByValue[header.type],
    header.status, statusAsString(header.status),
    header.length,
    header.spid,
    header.packetId,
    header.window
  )

  indent + text

statusAsString = (status) ->
  statuses = for name, value of STATUS
    if status & value
      name
  statuses.join(' ').trim()

dataToString = (data, indent) ->
  BYTES_PER_GROUP = 0x04
  CHARS_PER_GROUP = 0x08
  BYTES_PER_LINE = 0x20

  indent ||= ''

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

exports.HEADER_LENGTH = HEADER_LENGTH
exports.OFFSET = OFFSET
exports.STATUS = STATUS
exports.TYPE = TYPE

exports.decodeHeader = decodeHeader
exports.encodeHeader = encodeHeader

exports.dataToString = dataToString
exports.headerToString = headerToString
