codepageByLcid = require('../../collation').codepageByLcid

TYPE = require('../../data-type').TYPE
sprintf = require('sprintf').sprintf

module.exports = ->
  @tap "metadata", ->
    if @options.tdsVersion < "7_2"
      @uint16le "userType"
    else
      @uint32le "userType"

    @uint16le "flags"
    @uint8 "typeNumber"
    @tap ->
      @vars.type = type = TYPE[@vars.typeNumber]

      if !type
        throw new Error(sprintf('Unrecognised data type 0x%02X', typeNumber))

      @vars.dataLength = undefined
      if (type.id & 0x30) == 0x20
        # xx10xxxx - s2.2.4.2.1.3
        # Variable length
        switch type.dataLengthLength
          when 0
            @vars.dataLength = undefined
          when 1
            @uint8 "dataLength"
          when 2
            @uint16le "dataLength"
          when 4
            @uint32le "dataLength"
          else
            throw new Error("Unsupported dataLengthLength #{type.dataLengthLength} for data type #{type.name}")

      @uint8 "precision" if type.hasPrecision

      if type.hasScale
        @uint8 "scale"
        if type.dataLengthFromScale
          @tap ->
            @vars.dataLength = type.dataLengthFromScale @vars.scale

      if type.hasCollation
        @buffer("collationData", 5)
        @tap ->
          collationData = @vars.collationData
          delete @vars.collationData

          collation = {}

          collation.lcid = (collationData[2] & 0x0F) << 16
          collation.lcid |= collationData[1] << 8
          collation.lcid |= collationData[0]

          collation.codepage = codepageByLcid[collation.lcid]

          # This may not be extracting the correct nibbles in the correct order.
          collation.flags = collationData[3] >> 4
          collation.flags |= collationData[2] & 0xF0

          # This may not be extracting the correct nibble.
          collation.version = collationData[3] & 0x0F

          collation.sortId = collationData[4]
          @vars.collation = collation

      if type.hasSchemaPresent
        @uint8 "schemaPresent"
        @tap ->
          if @vars.schemaPresent == 0x01
            @tap "schema", ->
              @bVarchar "dbname"
              @bVarchar "owningSchema"
              @usVarchar "xmlSchemaCollection"

      if type.hasUDTInfo
        @tap "udtInfo", ->
          @uint16le "maxByteSize"
          @bVarchar "dbname"
          @bVarchar "owningSchema"
          @bVarchar "typeName"
          @usVarchar "assemblyName"
