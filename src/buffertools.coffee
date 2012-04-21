
Buffer.prototype.concat = () ->
  length = @length

  for buffer in arguments
    length += buffer.length

  result = new Buffer(length);
  
  @copy(result, 0, 0)
  position = @length

  for buffer in arguments
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
