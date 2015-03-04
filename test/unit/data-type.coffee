TYPES = require('../../src/data-type')
WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer')
ReadableTrackingBuffer = require('../../src/tracking-buffer/readable-tracking-buffer')

exports.noTypeOverridesByAliases = (test) ->
  typesByName = {}
  for id, type of TYPES.TYPE
    typesByName[type.name] = type

  for id, type of TYPES.TYPE
    for alias in (type.aliases || [])
      test.ok(not typesByName[alias], "Type #{alias} already exist. #{type.name} should not declare it as its alias.")

  test.done()

# Test some aliases
exports.knownAliases = (test) ->
  for alias in ['UniqueIdentifier', 'Date', 'Time', 'DateTime2', 'DateTimeOffset']
    test.strictEqual(TYPES.typeByName[alias], TYPES.typeByName["#{alias}N"], "Alias #{alias} is not pointing to #{alias}N type.")

  test.done()

# Test date calculation for non utc date during daylight savings period
exports.smallDateTimeDaylightSaving = (test) ->
  type = TYPES.typeByName['SmallDateTime']
  for testSet in [[new Date(2015,5,18,23,59,59),42171],
                  [new Date(2015,5,19,0,0,0),42172],
                  [new Date(2015,5,19,23,59,59),42172],
                  [new Date(2015,5,20,0,0,0),42173]]
    buffer = new WritableTrackingBuffer 8
    parameter = { value: testSet[0] }
    expectedNoOfDays = testSet[1]
    type.writeParameterData(buffer, parameter, { useUTC: false })
    test.strictEqual(buffer.buffer.readUInt16LE(1), expectedNoOfDays)
  test.done()

exports.dateTimeDaylightSaving = (test) ->
  type = TYPES.typeByName['DateTime']
  for testSet in [[new Date(2015,5,18,23,59,59),42171],
                  [new Date(2015,5,19,0,0,0),42172],
                  [new Date(2015,5,19,23,59,59),42172],
                  [new Date(2015,5,20,0,0,0),42173]]
    buffer = new WritableTrackingBuffer 16
    parameter = { value: testSet[0] }
    expectedNoOfDays = testSet[1]
    type.writeParameterData(buffer, parameter, { useUTC: false })
    test.strictEqual(buffer.buffer.readInt32LE(1), expectedNoOfDays)
  test.done()

exports.dateTime2DaylightSaving = (test) ->
  type = TYPES.typeByName['DateTime2']
  for testSet in [[new Date(2015,5,18,23,59,59),735766],
                  [new Date(2015,5,19,0,0,0),735767],
                  [new Date(2015,5,19,23,59,59),735767],
                  [new Date(2015,5,20,0,0,0),735768]]
    buffer = new WritableTrackingBuffer 16
    parameter = { value: testSet[0], scale: 0 }
    expectedNoOfDays = testSet[1]
    type.writeParameterData(buffer, parameter, { useUTC: false })
    rBuffer = new ReadableTrackingBuffer(buffer.buffer)
    rBuffer.readUInt8()
    rBuffer.readUInt24LE()
    test.strictEqual(rBuffer.readUInt24LE(), expectedNoOfDays)
  test.done()

exports.dateDaylightSaving = (test) ->
  type = TYPES.typeByName['Date']
  for testSet in [[new Date(2015,5,18,23,59,59),735766],
                  [new Date(2015,5,19,0,0,0),735767],
                  [new Date(2015,5,19,23,59,59),735767],
                  [new Date(2015,5,20,0,0,0),735768]]
    buffer = new WritableTrackingBuffer 16
    parameter = { value: testSet[0] }
    expectedNoOfDays = testSet[1]
    type.writeParameterData(buffer, parameter, { useUTC: false })
    rBuffer = new ReadableTrackingBuffer(buffer.buffer)
    rBuffer.readUInt8()
    test.strictEqual(rBuffer.readUInt24LE(), expectedNoOfDays)
  test.done()