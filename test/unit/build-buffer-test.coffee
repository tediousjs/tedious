buildBuffer = require('../../lib/build-buffer')
require('buffertools')

exports.unpairedArguments = (test) ->
  try
    buffer = buildBuffer('8', 0x12, '16')
    test.ok(false)
  catch error
  finally
    test.done()

exports.build_8_16_32_positive = (test) ->
  buffer = buildBuffer('8', 2, '16', 2, '32', 2)
  test.ok(buffer.equals(new Buffer([0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02])))

  test.done()

exports.build_8_16_32_negative = (test) ->
  buffer = buildBuffer('8', -2, '16', -2, '32', -2)
  test.ok(buffer.equals(new Buffer([0xFE, 0xFF, 0xFE, 0xFF, 0xFF, 0xFF, 0xFE])))

  test.done()

exports.build_U8_U16_U32_small = (test) ->
  buffer = buildBuffer('U8', 2, 'U16', 2, 'U32', 2)
  test.ok(buffer.equals(new Buffer([0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02])))

  test.done()

exports.build_U8_U16_U32_large = (test) ->
  buffer = buildBuffer('U8', 0xFE, 'U16', 0xFFFE, 'U32', 0xFFFFFFFE)
  test.ok(buffer.equals(new Buffer([0xFE, 0xFF, 0xFE, 0xFF, 0xFF, 0xFF, 0xFE])))

  test.done()
