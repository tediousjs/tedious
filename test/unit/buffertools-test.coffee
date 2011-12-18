require('../../lib/buffertools')

exports.concatOneArgument = (test) ->
  buffer1 = new Buffer([1, 2])
  buffer2 = new Buffer([3, 4])
  
  buffer12 = buffer1.concat(buffer2)
  
  test.ok(bufferEqual(buffer12, [1, 2, 3, 4]))

  test.done()

exports.concatTwoArguments = (test) ->
  buffer1 = new Buffer([1, 2])
  buffer2 = new Buffer([3, 4])
  buffer3 = new Buffer([5, 6])
  
  buffer123 = buffer1.concat(buffer2, buffer3)
  
  test.ok(bufferEqual(buffer123, [1, 2, 3, 4, 5, 6]))

  test.done()

bufferEqual = (actual, expected) ->
  if actual.length != expected.length
    return false

  for b in expected
    b--
    
    if actual[b] != expected[b]
      return false
    
    true
