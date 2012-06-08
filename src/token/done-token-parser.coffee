# s2.2.7.5/6/7

versions = require('../tds-versions').versionsByValue

STATUS =
  MORE: 0x0001
  ERROR: 0x0002
  INXACT: 0x0004      # This bit is not yet in use by SQL Server, so is
                      # not exposed in the returned token.
  COUNT: 0x0010
  ATTN: 0x0020
  SRVERROR: 0x0100

parser = (buffer, token, callback) ->
  buffer.readMultiple(
    status: buffer.readUInt16LE
    curCmd: buffer.readUInt16LE
    rowCount: buffer.readUInt64LE
    , (values) ->
      token.more = !!(values.status & STATUS.MORE)
      token.sqlError = !!(values.status & STATUS.ERROR)
      token.inTxn = !!(values.status & STATUS.INXACT)
      token.rowCountValid = !!(values.status & STATUS.COUNT)
      token.attention = !!(values.status & STATUS.ATTN)
      token.serverError = !!(values.status & STATUS.SRVERROR)
      token.serverError = !!(values.status & STATUS.SRVERROR)

      token.curCmd = values.curCmd

      # If rowCount > 53 bits then rowCount will be incorrect
      # (because Javascript uses IEEE_754 for number representation).
      if !token.rowCountValid
        token.rowCount = undefined
      else
        token.rowCount = values.rowCount

      callback(token)
  )

doneParser = (buffer, callback) ->
  token =
    name: 'DONE'
    event: 'done'
  parser(buffer, token, callback)

doneInProcParser = (buffer, callback) ->
  token =
    name: 'DONEINPROC'
    event: 'doneInProc'
  parser(buffer, token, callback)

doneProcParser = (buffer, callback) ->
  token =
    name: 'DONEPROC'
    event: 'doneProc'
  parser(buffer, token, callback)

exports.doneParser = doneParser
exports.doneInProcParser = doneInProcParser
exports.doneProcParser = doneProcParser
