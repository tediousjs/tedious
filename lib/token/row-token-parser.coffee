# s2.2.7.17

TYPE = require('./data-type').TYPE
sprintf = require('sprintf').sprintf
convertLEBytesToString= require('./bigint').convertLEBytesToString
convertUnsignedLEBytesToString= require('./bigint').convertUnsignedLEBytesToString

NULL = (1 << 16) - 1
THREE_AND_A_THIRD = 3 + (1 / 3)

isNullPLP= (buffer, position) ->
  return buffer.readUInt8(position) == 255 and buffer.readUInt8(position+1) == 255 and buffer.readUInt8(position+2) == 255 and buffer.readUInt8(position+3) == 255 and buffer.readUInt8(position+4) == 255 and buffer.readUInt8(position+5) == 255 and buffer.readUInt8(position+6) == 255 and buffer.readUInt8(position+7) == 255

isUnknownLengthPLP= (buffer, position) ->
  return buffer.readUInt8(position) == 254 and buffer.readUInt8(position+1) == 255 and buffer.readUInt8(position+2) == 255 and buffer.readUInt8(position+3) == 255 and buffer.readUInt8(position+4) == 255 and buffer.readUInt8(position+5) == 255 and buffer.readUInt8(position+6) == 255 and buffer.readUInt8(position+7) == 255

parser = (buffer, position, columnsMetaData) ->
  startPosition = position

  columns = []
  for columnMetaData in columnsMetaData
    #console.log sprintf('Token @ 0x%02X', position)

    isNull = false
    type = columnMetaData.type
    switch type.name
      when 'Binary'
        if buffer.length - position < type.dataLengthLength
          return false
        dataLength = buffer.readUInt16LE(position)
        position += 2
        if dataLength == 65535
          value = undefined
          isNull = true
        else
          value= Array.prototype.slice.call( buffer, position, position + dataLength )
          position += dataLength
      when 'TinyInt'
        if buffer.length - position < type.dataLength
          return false
        value = buffer.readUInt8(position)
        position += type.dataLength
      when 'Int'
        if buffer.length - position < type.dataLength
          return false
        value = buffer.readInt32LE(position)
        position += type.dataLength
      when 'SmallInt'
        if buffer.length - position < type.dataLength
          return false
        value = buffer.readInt16LE(position)
        position += type.dataLength
      when 'BigInt'
        if buffer.length - position < type.dataLength
          return false
        value= convertLEBytesToString( buffer.slice(position, position+8) )
        position += type.dataLength
      when 'IntN'
        if buffer.length - position < 1
          return false
        dataLength = buffer.readUInt8(position)
        position++

        if buffer.length - position < dataLength
          return false

        #console.log dataLength, position
        switch dataLength
          when 0
            isNull = true
          when 1
            value = buffer.readInt8(position)
          when 2
            value = buffer.readInt16LE(position)
          when 4
            value = buffer.readInt32LE(position)
          when 8
            value= convertLEBytesToString( buffer.slice(position, position+8) )

        position += dataLength
      when 'Bit'
        if buffer.length - position < type.dataLength
          return false
        value = !!buffer.readUInt8(position)
        position += type.dataLength
      when 'BitN'
        if buffer.length - position < 1
          return false
        dataLength = buffer.readUInt8(position)
        position++

        if buffer.length - position < dataLength
          return false

        #console.log dataLength, position
        switch dataLength
          when 0
            isNull = true
          when 1
            value = !!buffer.readUInt8(position)

        position += dataLength
      when 'VarChar', 'Char'
        if buffer.length - position < 2
          return false
        dataLength = buffer.readUInt16LE(position)
        position += 2

        if dataLength == NULL
          value = undefined
          isNull = true
        else
          if buffer.length - position < dataLength
            return false
          value = buffer.toString('ascii', position, position + dataLength)
          position += dataLength
      when 'NVarChar'
        if columnMetaData.dataLength == 65535
          # PARTLENTYPE (See 2.2.5.4.3 of MS-TDS.pdf)
          if buffer.length - position < 8
            return false
          if isNullPLP( buffer, position )
            position+= 8
            value = undefined
            isNull = true
          else if isUnknownLengthPLP( buffer, position )
            position+= 8
            #TODO: handle unknown lengths...
            return false
          else
            dataLength= convertUnsignedLEBytesToString( buffer.slice(position, position+8) )
            position+= 8

            chunkLength= buffer.readUInt32LE( position )
            position+= 4
            buf2= new Buffer(0)
            while( chunkLength != 0)
              buf3= new Buffer( buf2.length+ chunkLength)
              buf2.copy( buf3, 0, 0)
              buffer.copy( buf3, buf2.length, position, position+chunkLength )
              buf2= buf3
              position+= chunkLength
              chunkLength= buffer.readUInt32LE( position )
              position+=4

            #todo: the specification says that we need to compare the 'dataLength' we
            # noted up above with the actual received length of data, but as this
            # could be a 64bit number that could be a PITA (I suspect the buffer would
            # die long before this becomes an actual issue.. so for now we just hope for the best)
            value = buf2.toString('ucs-2')
        else
          if buffer.length - position < 2
            return false
          dataLength = buffer.readUInt16LE(position)
          position += 2

          if dataLength == NULL
            value = undefined
            isNull = true
          else
            if buffer.length - position < dataLength
              return false
            value = buffer.toString('ucs-2', position, position + (dataLength))
            position += dataLength
      when 'NChar'
        if buffer.length - position < 2
          return false
        dataLength = buffer.readUInt16LE(position)
        position += 2

        if dataLength == NULL
          value = undefined
          isNull = true
        else
          if buffer.length - position < dataLength
            return false
          value = buffer.toString('ucs-2', position, position + (dataLength))
          position += dataLength
      when 'SmallDateTime'
        if buffer.length - position < 4
          return false

        days = buffer.readUInt16LE(position)
        minutes = buffer.readUInt16LE(position + 2)
        
        value = new Date(1900, 0, 1)
        value.setDate(value.getDate() + days)
        value.setMinutes(value.getMinutes() + minutes)
        
        position += type.dataLength
      when 'DateTime'
        if buffer.length - position < 8
          return false

        days = buffer.readInt32LE(position)
        threeHundredthsOfSecond = buffer.readUInt32LE(position + 4)
        milliseconds = threeHundredthsOfSecond * THREE_AND_A_THIRD
        
        value = new Date(1900, 0, 1)
        value.setDate(value.getDate() + days)
        value.setMilliseconds(value.getMilliseconds() + milliseconds)
        
        position += type.dataLength
      when 'DateTimeN'
        if buffer.length - position < 1
          return false
        dataLength = buffer.readUInt8(position)
        position++

        if buffer.length - position < dataLength
          return false

        switch dataLength
          when 0
            isNull = true
          when 4
            days = buffer.readUInt16LE(position)
            minutes = buffer.readUInt16LE(position + 2)
            
            value = new Date(1900, 0, 1)
            value.setDate(value.getDate() + days)
            value.setMinutes(value.getMinutes() + minutes)
          when 8
            days = buffer.readInt32LE(position)
            threeHundredthsOfSecond = buffer.readUInt32LE(position + 4)
            milliseconds = threeHundredthsOfSecond * THREE_AND_A_THIRD
            
            value = new Date(1900, 0, 1)
            value.setDate(value.getDate() + days)
            value.setMilliseconds(value.getMilliseconds() + milliseconds)
        
        position += dataLength
      when 'NumericN','DecimalN'
        if buffer.length - position < 1
          return false
        dataLength = buffer.readUInt8(position)
        position++

        if dataLength == 0
          value = undefined
          isNull = true
        else
          if buffer.length - position < dataLength
            return false
            
          sign = if buffer.readUInt8(position) == 1 then 1 else -1
          position++

          switch dataLength - 1
            when 4
              value = buffer.readUInt32LE(position)
              position += 4
            when 8
              valueLow = buffer.readUInt32LE(position)
              position += 4
              valueHigh = buffer.readUInt32LE(position)
              position += 4
              value = valueLow + (0x100000000 * valueHigh)
            else
              error = sprintf('Unsupported numeric size %d at offset 0x%04X', dataLength - 1, position)
              break

          value *= sign
          value /= Math.pow(10, columnMetaData.scale)
      else
        error = sprintf('Unrecognised column type %s at offset 0x%04X', type.name, (position - 1))
        break
      
    columns.push(
      value: value
      isNull: isNull,
      metadata: columnMetaData
    )

  columns.byName = ->
    byName = {}

    for column in columns
      byName[column.metadata.colName] = column

    byName

  if error
    token =
      name: 'ROW'
      error: error
  else
    token =
      name: 'ROW'
      length: position - startPosition
      event: 'row'
      columns: columns

module.exports = parser
