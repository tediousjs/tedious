buildBuffer = () ->
  if arguments.length % 2 != 0
    throw new Error("Expected pairs of arguments, but have #{arguments.length} arguments")

  length = 0;
  for format in arguments by 2
    switch format
      when '8', 'U8'
        length += 1
      when '16', 'U16'
        length += 2
      when '32', 'U32'
        length += 4
      else
        throw new Error("Format '#{format}' not recognised")

  buffer = new Buffer(length)

  offset = 0
  for a in [0..arguments.length - 1] by 2
    format = arguments[a]
    value = arguments[a + 1]

    switch format
      when '8'
        buffer.writeInt8(value, offset)
        offset += 1
      when 'U8'
        buffer.writeUInt8(value, offset)
        offset += 1
      when '16'
        buffer.writeInt16BE(value, offset)
        offset += 2
      when 'U16'
        buffer.writeUInt16BE(value, offset)
        offset += 2
      when '32'
        buffer.writeInt32BE(value, offset)
        offset += 4
      when 'U32'
        buffer.writeUInt32BE(value, offset)
        offset += 4
      else
        throw new Error("Format '#{format}' not recognised")

  buffer

module.exports = buildBuffer
