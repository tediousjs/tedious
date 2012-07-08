TYPES = require('../../src/tedious').TYPES
ISOLATION_LEVEL = require('../../src/tedious').ISOLATION_LEVEL
Connection = require('../../src/tedious').Connection

exports.types = function(test) {
  test.ok(TYPES)
  test.ok(TYPES.VarChar)

  test.done()
}

exports.isolationLevel = function(test) {
  test.ok(ISOLATION_LEVEL)
  test.ok(ISOLATION_LEVEL.READ_UNCOMMITTED)

  test.done()
}

exports.connection = function(test) {
  test.ok(Connection)

  test.done()
}
