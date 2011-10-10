Packet = require('./packet').Packet

class TabularResultPacket extends Packet
  constructor: (buffer) ->
    super(buffer)

  payloadString: (indent) ->
    indent ||= ''

    ''

exports.TabularResultPacket = TabularResultPacket
