TYPES = require('../../src/data-type')
WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer')

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
  for testSet in [[new Date('2015-06-18T23:59:59+0200'),42171],
                  [new Date('2015-06-19T00:00:00+0200'),42172],
                  [new Date('2015-06-19T23:59:59+0200'),42172],
                  [new Date('2015-06-20T00:00:00+0200'),42173]]
    buffer = new WritableTrackingBuffer 8
    parameter = { value: testSet[0] }
    expectedNoOfDays = testSet[1]
    type.writeParameterData(buffer, parameter, { useUTC: false })
    test.strictEqual(buffer.buffer.readUInt16LE(1), expectedNoOfDays)
  test.done()

exports.dateTimeDaylightSaving = (test) ->
  type = TYPES.typeByName['DateTime']
  for testSet in [[new Date('2015-06-18T23:59:59+0200'),42171],
                  [new Date('2015-06-19T00:00:00+0200'),42172],
                  [new Date('2015-06-19T23:59:59+0200'),42172],
                  [new Date('2015-06-20T00:00:00+0200'),42173]]
    buffer = new WritableTrackingBuffer 16
    parameter = { value: testSet[0] }
    expectedNoOfDays = testSet[1]
    type.writeParameterData(buffer, parameter, { useUTC: false })
    test.strictEqual(buffer.buffer.readInt32LE(1), expectedNoOfDays)
  test.done()

exports.dateTimeDaylightSaving = (test) ->
  type = TYPES.typeByName['DateTime2']
  for testSet in [[new Date('2015-06-18T23:59:59+0200'),735766],
                  [new Date('2015-06-19T00:00:00+0200'),735767],
                  [new Date('2015-06-19T23:59:59+0200'),735767],
                  [new Date('2015-06-20T00:00:00+0200'),735768]]
    buffer = new WritableTrackingBuffer 16
    parameter = { value: testSet[0], scale: 0 }
    expectedNoOfDays = testSet[1]
    type.writeParameterData(buffer, parameter, { useUTC: false })
    test.strictEqual(buffer.buffer.readUIntLE(4,3), expectedNoOfDays)
  test.done()

exports.dateDaylightSaving = (test) ->
  type = TYPES.typeByName['Date']
  for testSet in [[new Date('2015-06-18T23:59:59+0200'),735766],
                  [new Date('2015-06-19T00:00:00+0200'),735767],
                  [new Date('2015-06-19T23:59:59+0200'),735767],
                  [new Date('2015-06-20T00:00:00+0200'),735768]]
    buffer = new WritableTrackingBuffer 16
    parameter = { value: testSet[0] }
    expectedNoOfDays = testSet[1]
    type.writeParameterData(buffer, parameter, { useUTC: false })
    test.strictEqual(buffer.buffer.readUIntLE(1,3), expectedNoOfDays)
  test.done()