array_is_zeroed = (array) ->
  array[0] is 0 and array[1] is 0 and array[2] is 0 and array[3] is 0 and array[4] is 0 and array[5] is 0 and array[6] is 0 and array[7] is 0

getNextRemainder = (x) ->
  remainder = 0
  s = undefined
  i = 7

  while i >= 0
    s = (remainder * 256) + x[i]
    x[i] = Math.floor(s / 10)
    remainder = s % 10
    i--
  "" + remainder

invert = (array) ->
  i = 7

  while i >= 0
    array[i] = array[i] ^ 0xFF
    i--
  i = 0

  while i < 8
    array[i] = array[i] + 1
    if array[i] > 255
      array[i] = 0
    else
      break
    i++

convertLEBytesToString = (buffer) ->
  array = []
  i = 0

  while i <= 7
    array[i] = buffer[i]
    i++
  if array_is_zeroed(array)
    "0"
  else
    sign = (if (array[7] & 0x80) is 0x80 then "-" else "")
    invert array  if sign is "-"
    result = ""
    until array_is_zeroed(array)
      t = getNextRemainder(array)
      result = t + "" + result
    sign + result

module.exports.convertLEBytesToString = convertLEBytesToString