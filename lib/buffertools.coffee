
Buffer.prototype.concat = () ->
  length = this.length

  for buffer in arguments
    length += buffer.length

  result = new Buffer(length);
  
  this.copy(result, 0, 0)
  position = this.length

  for buffer in arguments
    buffer.copy(result, position, 0)
    position += buffer.length

  result