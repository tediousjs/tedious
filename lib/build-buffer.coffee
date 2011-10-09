buildBuffer = () ->
  if arguments.length % 2 != 0
    throw new Error("Expected pairs of arguments, but have #{arguments.length} arguments")

  length = 0;
  for format in arguments by 2
    switch format
      when '8'
        length += 1
      when '16'
        length += 2
      when '32'
        length += 4
      else
        throw new Error("Format '#{format}' not recognised")

  buffer = new Buffer(length)

  offset = 0
  for a in [0..arguments.length] by 2
    format = arguments[a]
    value = arguments[a + 1]

    switch format
      when '8'
        buffer.writeUInt8(value, offset)
        offset += 1
      when '16'
        buffer.writeUInt16BE(value, offset)
        offset += 2
      when '32'
        buffer.writeUInt32BE(value, offset)
        offset += 4

  buffer

module.exports = buildBuffer
