if !Buffer.concat
  Buffer.concat = (buffers) ->
    length = 0
    for buffer in buffers
      length += buffer.length

    result = new Buffer(length);

    position = 0
    for buffer in buffers
      buffer.copy(result, position, 0)
      position += buffer.length

    result

Buffer.prototype.toByteArray = () ->
  Array.prototype.slice.call(@, 0)

Buffer.prototype.equals = (other) ->
  if @.length != other.length
    return false

  for b, index in @
    if @[index] != other[index]
      return false

  true
