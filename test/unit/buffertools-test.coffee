require('../../src/buffertools')

exports.concatOneArgument = (test) ->
  buffer1 = new Buffer([1, 2])
  buffer2 = new Buffer([3, 4])

  buffer12 = Buffer.concat([buffer1, buffer2])

  test.deepEqual(buffer12, new Buffer([1, 2, 3, 4]))

  test.done()

exports.concatTwoArguments = (test) ->
  buffer1 = new Buffer([1, 2])
  buffer2 = new Buffer([3, 4])
  buffer3 = new Buffer([5, 6])

  buffer123 = Buffer.concat([buffer1, buffer2, buffer3])

  test.deepEqual(buffer123, new Buffer([1, 2, 3, 4, 5, 6]))

  test.done()

exports.toByteArray = (test) ->
  buffer = new Buffer([1, 2, 3])
  array = buffer.toByteArray();

  test.ok(arrayEqual(array, [1, 2, 3]));

  test.done()

exports.equalsNonEmpty = (test) ->
  buffer1 = new Buffer([1, 2, 3])
  buffer2 = new Buffer([1, 2, 3])

  test.ok(buffer1.equals(buffer2));

  test.done()

exports.equalsDifferent = (test) ->
  buffer1 = new Buffer([1, 2, 3])
  buffer2 = new Buffer([1, 2, 9])

  test.ok(!buffer1.equals(buffer2));

  test.done()

exports.equalsEmpty = (test) ->
  buffer1 = new Buffer([])
  buffer2 = new Buffer([])

  test.ok(buffer1.equals(buffer2));

  test.done()

exports.equalsOneEmpty = (test) ->
  buffer1 = new Buffer([1, 2, 3])
  buffer2 = new Buffer([])

  test.ok(!buffer1.equals(buffer2));

  test.done()

bufferEqual = (actual, expected) ->
  if actual.length != expected.length
    return false

  for b in expected
    b--

    if actual[b] != expected[b]
      return false

  true

arrayEqual = bufferEqual
