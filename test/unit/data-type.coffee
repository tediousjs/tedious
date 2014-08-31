TYPES = require('../../src/data-type')

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
