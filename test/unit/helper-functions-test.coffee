DeepCopy = require('../../src/helper-functions').DeepCopy;

exports.deepCopyOneLevel = (test) ->
  source = { a: 5, c: "something" }
  destination = {}

  DeepCopy(destination, source)
  test.ok(JSON.stringify(source) == JSON.stringify(destination))

  source.a = 6
  test.ok(JSON.stringify(source) != JSON.stringify(destination))
  test.done()

exports.deepCopyTwoLevels = (test) ->
  source = { a: 5, c: "something", level2: { d: 3.4, e: true } }
  destination = {}

  DeepCopy(destination, source)
  test.ok(JSON.stringify(source) == JSON.stringify(destination))

  source.level2.d = 3.5
  test.ok(JSON.stringify(source) != JSON.stringify(destination))
  test.done()

exports.deepCopyThreeLevels = (test) ->
  source = { a: 5, c: "something", level2: { d: 3.4, e: true, level3: { f: 3234532, g: 43215 } } }
  destination = {}

  DeepCopy(destination, source)
  test.ok(JSON.stringify(source) == JSON.stringify(destination))

  source.level2.level3.f = 1234
  test.ok(JSON.stringify(source) != JSON.stringify(destination))
  test.done()
