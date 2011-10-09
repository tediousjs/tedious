Connection = require('../../lib/tedious').Connection

exports.connection = function(test) {
  test.ok(Connection)

  test.done()
}
