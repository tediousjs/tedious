# s2.2.7.8

EventEmitter = require('events').EventEmitter

types =
  1:
    name: 'DATABASE'
    event: 'databaseChange'
  2:
    name: 'LANGUAGE',
    event: 'languageChange'
  3:
    name: 'CHARSET'
    event: 'charsetChange'
  4:
    name: 'PACKET_SIZE'
    event: 'packetSizeChange'
  7:
    name: 'SQL_COLLATION'
    event: 'sqlCollationChange'
  8:
    name: 'BEGIN_TXN'
    event: 'beginTransaction'
  9:
    name: 'COMMIT_TXN'
    event: 'commitTransaction'
  10:
    name: 'ROLLBACK_TXN'
    event: 'rollbackTransaction'
  13:
    name: 'DATABASE_MIRRORING_PARTNER'
    event: 'partnerNode'
  17:
    name: 'TXN_ENDED'
  18:
    name: 'RESET_CONNECTION'
    event: 'resetConnection'
  20:
    name: 'ROUTING_CHANGE'
    event: 'routingChange'

module.exports = (buffer) ->
  length = buffer.readUInt16LE()
  typeNumber = buffer.readUInt8()
  type = types[typeNumber]

  if type
    switch type.name
      when 'DATABASE', 'LANGUAGE', 'CHARSET', 'PACKET_SIZE', 'DATABASE_MIRRORING_PARTNER'
        newValue = buffer.readBVarchar()
        oldValue = buffer.readBVarchar()
      when 'SQL_COLLATION', 'BEGIN_TXN', 'COMMIT_TXN', 'ROLLBACK_TXN', 'RESET_CONNECTION'
        valueLength = buffer.readUInt8()
        newValue = buffer.readBuffer(valueLength)

        valueLength = buffer.readUInt8()
        oldValue = buffer.readBuffer(valueLength)
      when 'ROUTING_CHANGE'
        valueLength = buffer.readUInt16LE()

        # Routing Change:
        # Byte 1: Protocol (must be 0)
        # Bytes 2-3 (USHORT): Port number
        # Bytes 4-5 (USHORT): Length of server data in unicode (2byte chars)
        # Bytes 6-*: Server name in unicode characters
        
        routePacket = buffer.readBuffer(valueLength)
        protocol = routePacket.readUInt8(0)
        if (protocol != 0)
          throw new Error('Unknown protocol byte in routing change event')

        port = routePacket.readUInt16LE(1)

        serverLen = routePacket.readUInt16LE(3)
        # 2 bytes per char, starting at offset 5
        server = routePacket.toString('ucs2', 5, 5 + (serverLen * 2))
      
        newValue =
          protocol: protocol
          port: port
          server: server

        valueLength = buffer.readUInt16LE()
        oldValue = buffer.readBuffer(valueLength)
      else
        console.error "Tedious > Unsupported ENVCHANGE type #{typeNumber} #{type.name} at offset #{buffer.position - 1}"
        buffer.readBuffer length - 1 # skip unknown bytes
        return

    if type.name == 'PACKET_SIZE'
      newValue = parseInt(newValue)
      oldValue = parseInt(oldValue)
  else
    console.error "Tedious > Unsupported ENVCHANGE type #{typeNumber} at offset #{buffer.position - 1}"
    buffer.readBuffer length - 1 # skip unknown bytes
    return

  # Return token
  name: 'ENVCHANGE'
  type: type.name
  event: type.event
  oldValue: oldValue
  newValue: newValue
