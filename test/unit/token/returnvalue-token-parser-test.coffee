parser = require('../../../src/token/returnvalue-token-parser')
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer
dataTypeByName = require('../../../src/data-type').typeByName

module.exports.returnvalue = (test) ->
  paramOrdinal = 1
  paramName = 'name'
  status = 3
  value = 4

  metadata =
    userType: 2
    flags: 3
    dataTypeId: dataTypeByName.Int.id

  buffer = new WritableTrackingBuffer(50, 'ucs2')
  buffer.writeUInt16LE(paramOrdinal)
  buffer.writeBVarchar(paramName)
  buffer.writeUInt8(status)
  buffer.writeUInt32LE(metadata.userType)
  buffer.writeUInt16LE(metadata.flags)
  buffer.writeUInt8(metadata.dataTypeId)
  buffer.writeUInt32LE(value)

  parser(new ReadableTrackingBuffer(buffer.data), (token) ->
    test.strictEqual(token.paramOrdinal, paramOrdinal)
    test.strictEqual(token.paramName, paramName)
    test.strictEqual(token.metadata.type.name, "Int")
    test.strictEqual(token.value, value)

    test.done()
  )
