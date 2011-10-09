buildBuffer = require('../../lib/build-buffer')
require('buffertools')

exports.unpairedArguments = (test) ->
  try
    buffer = buildBuffer('8', 0x012, '16')
    test.ok(false)
  catch error
  finally
    test.done()

exports.build_8_16_32 = (test) ->
  buffer = buildBuffer('8', 0x012, '16', 0x1234, '32', 0x123456)

  test.ok(buffer.equals(new Buffer([0x12, 0x12, 0x34, 0x00, 0x12, 0x34, 0x56])))

  test.done()
