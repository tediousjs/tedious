STATUS =
  MORE: 0x0001
  ERROR: 0x0002
  # This bit is not yet in use by SQL Server,
  # so is not exposed in the returned token.
  INXACT: 0x0004
  COUNT: 0x0010
  ATTN: 0x0020
  SRVERROR: 0x0100

TYPE = require("../token").TYPE

module.exports = ->
  @uint16le("status").uint16le("curCmd").tap ->
    if @options.tdsVersion < "7_2"
      @uint32le("rowCount")
    else
      # If rowCount > 53 bits then rowCount will be incorrect
      # (because Javascript uses IEEE_754 for number representation).
      @uint64le("rowCount")

  @tap ->
    {status, curCmd, rowCount} = @vars

    more = !!(status & STATUS.MORE)
    sqlError = !!(status & STATUS.ERROR)
    inTxn = !!(status & STATUS.INXACT)
    rowCountValid = !!(status & STATUS.COUNT)
    attention = !!(status & STATUS.ATTN)
    serverError = !!(status & STATUS.SRVERROR)

    token =
      more: more
      sqlError: sqlError
      attention: attention
      serverError: serverError
      rowCount: rowCount if rowCountValid
      curCmd: curCmd

    switch @vars.type
      when TYPE.DONE
        token.name = 'DONE'
        token.event = 'done'
      when TYPE.DONEPROC
        token.name = 'DONEPROC'
        token.event = 'doneProc'
      when TYPE.DONEINPROC
        token.name = 'DONEINPROC'
        token.event = 'doneInProc'

    @push(token)
