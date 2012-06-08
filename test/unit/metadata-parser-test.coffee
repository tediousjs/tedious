parser = require('../../src/metadata-parser')
dataTypeByName = require('../../src/data-type').typeByName
ReadableTrackingBuffer = require('../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.int = (test) ->
  userType = 2
  flags = 3

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt32LE(userType)
  buffer.writeUInt16LE(flags)
  buffer.writeUInt8(dataTypeByName.Int.id)
  #console.log(buffer.data)

  parser(new ReadableTrackingBuffer(buffer.data), (metadata) ->
    #console.log(metadata)

    test.strictEqual(metadata.userType, 2)
    test.strictEqual(metadata.flags, 3)
    test.strictEqual(metadata.type.name, 'Int')

    test.done()
  )

module.exports.varchar = (test) ->
  userType = 2
  flags = 3
  length = 3
  collation = new Buffer([0x09, 0x04, 0x50, 0x78, 0x9a])

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt32LE(userType)
  buffer.writeUInt16LE(flags)
  buffer.writeUInt8(dataTypeByName.VarChar.id)
  buffer.writeUInt16LE(length)
  buffer.writeBuffer(collation)
  #console.log(buffer)

  parser(new ReadableTrackingBuffer(buffer.data), (metadata) ->
    #console.log(metadata)

    test.strictEqual(metadata.userType, 2)
    test.strictEqual(metadata.flags, 3)
    test.strictEqual(metadata.type.name, 'VarChar')
    test.strictEqual(metadata.collation.lcid, 0x0409)
    test.strictEqual(metadata.collation.codepage, 'WINDOWS-1252')
    test.strictEqual(metadata.collation.flags, 0x57)
    test.strictEqual(metadata.collation.version, 0x8)
    test.strictEqual(metadata.collation.sortId, 0x9a)

    test.done()
  )
