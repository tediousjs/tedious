TYPE = require('../../src/data-type').TYPE

exports.noTypeOverridesByAliases = (test) ->
  typesByName = {}
  for id, type of TYPE
    typesByName[type.name] = type

  for id, type of TYPE
    for alias in type.aliases
      test.ok(not typesByName[alias], "Type #{alias} already exist. #{type.name} should not declare it as its alias.")

  test.done()
