# s2.2.7.8

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

module.exports = ->
  @uint16le("length")
  @uint8("typeNumber")
  @tap ->
    type = types[@vars.typeNumber]

    if !type
      console.error "Tedious > Unsupported ENVCHANGE type #{@vars.typeNumber}"
      # Skip unknown bytes
      return @buffer("_", @vars.length - 1)
    
    switch type.name
      when 'DATABASE', 'LANGUAGE', 'CHARSET', 'PACKET_SIZE', 'DATABASE_MIRRORING_PARTNER'
        @bVarchar("newValue")
        @bVarchar("oldValue")
        if type.name == 'PACKET_SIZE'
          @tap ->
            @vars.newValue = parseInt(@vars.newValue)
            @vars.oldValue = parseInt(@vars.oldValue)
      when 'SQL_COLLATION', 'BEGIN_TXN', 'COMMIT_TXN', 'ROLLBACK_TXN', 'RESET_CONNECTION'
        @bVarbyte("newValue")
        @bVarbyte("oldValue")
      when 'ROUTING_CHANGE'
        @uint8("protocol")
        @tap ->
          if protocol != 0
            throw new Error('Unknown protocol byte in routing change event')
        @uint16le("port")
        @usVarchar("server")
        @uint16le("_") # Skip 2 bytes for old value
        @tap ->
          @vars.oldValue = {}
          @vars.newValue =
            protocol: @vars.protocol
            port: @vars.port
            server: @vars.server

    @tap ->
      @push
        name: 'ENVCHANGE'
        type: type.name
        event: type.event
        oldValue: @vars.oldValue
        newValue: @vars.newValue
