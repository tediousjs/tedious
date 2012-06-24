TYPES = require('../../src/tedious').TYPES
Connection = require('../../src/tedious').Connection
version = require('../../src/tedious').version

exports.types = function(test) {
  test.ok(TYPES)
  test.ok(TYPES.VarChar)

  test.done()
}

exports.connection = function(test) {
  test.ok(Connection)

  test.done()
}

exports.version = function(test) {
  test.ok(version)

  test.done()
}
