# s2.2.7.5/6/7

STATUS =
  MORE: 0x0001
  ERROR: 0x0002
  INXACT: 0x0004      # This bit is not yet in use by SQL Server, so is not exposed in the returned token.
  COUNT: 0x0010
  ATTN: 0x0020
  SRVERROR: 0x0100

parseToken = (parser, options) ->
  status = yield parser.readUInt16LE()

  more = !!(status & STATUS.MORE)
  sqlError = !!(status & STATUS.ERROR)
  inTxn = !!(status & STATUS.INXACT)
  rowCountValid = !!(status & STATUS.COUNT)
  attention = !!(status & STATUS.ATTN)
  serverError = !!(status & STATUS.SRVERROR)

  curCmd = yield parser.readUInt16LE()

  # If rowCount > 53 bits then rowCount will be incorrect (because Javascript uses IEEE_754 for number representation).
  if options.tdsVersion < "7_2"
    rowCount = yield parser.readUInt32LE()
  else
    rowCount = yield parser.readUInt64LE()

  if !rowCountValid
    rowCount = undefined

  token =
    name: 'DONE'
    event: 'done'
    more: more
    sqlError: sqlError
    attention: attention
    serverError: serverError
    rowCount: rowCount
    curCmd: curCmd

doneParser = (parser, colMetadata, options) ->
  token = yield from parseToken(parser, options)
  token.name = 'DONE'
  token.event = 'done'

  token

doneInProcParser = (parser, colMetadata, options) ->
  token = yield from parseToken(parser, options)
  token.name = 'DONEINPROC'
  token.event = 'doneInProc'

  token

doneProcParser = (parser, colMetadata, options) ->
  token = yield from parseToken(parser, options)
  token.name = 'DONEPROC'
  token.event = 'doneProc'

  token

exports.doneParser = doneParser
exports.doneInProcParser = doneInProcParser
exports.doneProcParser = doneProcParser
