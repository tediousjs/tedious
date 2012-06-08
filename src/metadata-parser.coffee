codepageByLcid = require('./collation').codepageByLcid

TYPE = require('./data-type').TYPE
sprintf = require('sprintf').sprintf

parse = (buffer, callback) ->
  metadata = {}

  buffer.readMultiple(
    userType: buffer.readUInt32LE
    flags: buffer.readUInt16LE
    typeNumber: buffer.readUInt8
    , (values) ->
      metadata.userType = values.userType
      metadata.flags = values.flags
      metadata.type = TYPE[values.typeNumber]

      if !metadata.type
        throw new Error(sprintf('Unrecognised data type 0x%02X at offset 0x%04X', values.typeNumber, (buffer.position - 1)))
      #console.log(type)

      requestValues = {}

      if (metadata.type.id & 0x30) == 0x20
        # xx10xxxx - s2.2.4.2.1.3
        # Variable length
        switch metadata.type.dataLengthLength
          when 1
            requestValues.dataLength = buffer.readUInt8
          when 2
            requestValues.dataLength = buffer.readUInt16LE
          when 4
            requestValues.dataLength = buffer.readUInt32LE
          else
            throw new Error("Unsupported dataLengthLength #{metadata.type.dataLengthLength} for data type #{metadata.type.name}")

      if metadata.type.hasPrecision
        requestValues.precision = buffer.readUInt8

      if metadata.type.hasScale
        requestValues.scale = buffer.readUInt8

      if metadata.type.hasCollation
        requestValues.collationData = [buffer.readBuffer, [5]]

      if Object.keys(requestValues).length
        buffer.readMultiple(requestValues, (optionalValues) ->
          if requestValues.dataLength
            metadata.dataLength = optionalValues.dataLength

          if requestValues.precision
            metadata.precision = optionalValues.precision

          if requestValues.scale
            metadata.scale = optionalValues.scale

          if requestValues.collationData
            # s2.2.5.1.2
            collation = {}

            collation.lcid = (optionalValues.collationData[2] & 0x0F) << 16
            collation.lcid |= optionalValues.collationData[1] << 8
            collation.lcid |= optionalValues.collationData[0]

            collation.codepage = codepageByLcid[collation.lcid]

            # This may not be extracting the correct nibbles in the correct order.
            collation.flags = optionalValues.collationData[3] >> 4
            collation.flags |= optionalValues.collationData[2] & 0xF0

            # This may not be extracting the correct nibble.
            collation.version = optionalValues.collationData[3] & 0x0F

            collation.sortId = optionalValues.collationData[4]

            metadata.collation = collation

          callback(metadata)
        )
      else
        callback(metadata)
  )

module.exports = parse
