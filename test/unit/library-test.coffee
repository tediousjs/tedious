library = require('../../lib/library')

module.exports.name = (test) ->
  test.strictEqual(library.name, 'Tedious')
  test.done()

module.exports.version = (test) ->
  test.ok(/\d+\.\d+\.\d+/.test(library.version))
  test.done()
