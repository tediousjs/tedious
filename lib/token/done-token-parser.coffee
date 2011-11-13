# s2.2.7.5

versions = require('../tds-versions').versionsByValue

STATUS =
  MORE: 0x0001
  ERROR: 0x0002
  INXACT: 0x0004      # This bit is not yet in use by SQL Server, so is not exposed in the returned token.
  COUNT: 0x0010
  ATTN: 0x0020
  SRVERROR: 0x0100

parser = (buffer, position) ->
  status = buffer.readUInt16LE(position)
  position += 2

  more = status & STATUS.MORE
  sqlError = status & STATUS.ERROR
  inTxn = status & STATUS.INXACT
  rowCountValid = status & STATUS.COUNT
  attention = status & STATUS.ATTN
  serverError = status & STATUS.SRVERROR

  curCmd = buffer.readUInt16LE(position)
  position += 2

  if rowCountValid
    # If rowCount > 53 bits then rowCount will be incorrect (because Javascript uses IEEE_754 for number representation).
    rowCountLow = buffer.readUInt32LE(position)
    position += 4
    rowCountHigh = buffer.readUInt32LE(position)
    position += 4
    rowCount = rowCountLow + (0x100000000 * rowCountHigh)

  token =
    name: 'DONE'
    length: 2 + 2 + 8
    event: 'done'
    more: more
    sqlError: sqlError
    attention: attention
    serverError: serverError
    rowCount: rowCount
    curCmd: curCmd

doneParser = (buffer, position) ->
  token = parser(buffer, position)
  token.name = 'DONE'
  token.event = 'done'

  token

doneInProcParser = (buffer, position) ->
  token = parser(buffer, position)
  token.name = 'DONEINPROC'
  token.event = 'doneInProc'

  token

doneProcParser = (buffer, position) ->
  token = parser(buffer, position)
  token.name = 'DONEPROC'
  token.event = 'doneProc'

  token

exports.doneParser = doneParser
exports.doneInProcParser = doneInProcParser
exports.doneProcParser = doneProcParser
