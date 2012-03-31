TYPES = require('../../lib/tedious').TYPES
Connection = require('../../lib/tedious').Connection

exports.types = function(test) {
  test.ok(TYPES)
  test.ok(TYPES.VarChar)

  test.done()
}

exports.connection = function(test) {
  test.ok(Connection)

  test.done()
}
