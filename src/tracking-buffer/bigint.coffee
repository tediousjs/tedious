isZero = (array) ->
  for byte in array
    if byte != 0
      return false

  true

getNextRemainder = (array) ->
  remainder = 0

  for index in [array.length - 1..0] by -1
    s = (remainder * 256) + array[index]
    array[index] = Math.floor(s / 10)
    remainder = s % 10

  remainder

invert = (array) ->
  # Invert bits
  for byte, index in array
    array[index] = array[index] ^ 0xFF

  for byte, index in array
    array[index] = array[index] + 1
    if array[index] > 255
      array[index] = 0
    else
      break

convertLEBytesToString = (buffer) ->
  array = Array.prototype.slice.call(buffer, 0, buffer.length)

  if isZero(array)
    '0'
  else
    if array[array.length - 1] & 0x80
      sign = '-'
      invert(array)
    else
      sign = ''

    result = ''
    until isZero(array)
      t = getNextRemainder(array)
      result = t + result

    sign + result

numberToInt64LE = (num) ->
  # adapted from https://github.com/broofa/node-int64
  negate = num < 0
  hi = Math.abs(num)
  lo = hi % 0x100000000
  hi = (hi / 0x100000000) | 0
  
  buf = new Buffer(8)
  for i in [0..7]
    buf[i] = lo & 0xff
    lo = if i == 3 then hi else lo >>> 8
  
  if negate
    carry = 1
    for i in [0..7]
      v = (buf[i] ^ 0xff) + carry
      buf[i] = v & 0xff
      carry = v >> 8
  
  return buf

module.exports.convertLEBytesToString = convertLEBytesToString
module.exports.numberToInt64LE = numberToInt64LE
