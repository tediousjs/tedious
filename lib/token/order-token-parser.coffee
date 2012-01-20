# s2.2.7.14

parser = (buffer) ->
  columnCount = buffer.readUInt16LE() / 2;

  orderColumns = []
  for c in [1..columnCount]
    orderColumns.push(buffer.readUInt16LE())

  # Return token
  name: 'ORDER'
  event: 'order'
  orderColumns: orderColumns

module.exports = parser
