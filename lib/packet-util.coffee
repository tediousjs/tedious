PreloginPacket = require('./packet-prelogin').PreloginPacket
TabularResultPacket = require('./packet-tabular-result').TabularResultPacket

OFFSET = require('./packet').OFFSET
TYPE = require('./packet').TYPE

packetFromBuffer = (buffer) ->
  type = buffer.readUInt8(OFFSET.Type)
  switch type
    when TYPE.PRELOGIN
      new PreloginPacket(buffer)
    when TYPE.TABULAR_RESULT
      new TabularResultPacket(buffer)
    else
      new Packet(buffer)

exports.packetFromBuffer = packetFromBuffer
