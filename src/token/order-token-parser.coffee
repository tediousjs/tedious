# s2.2.7.14

module.exports = (parser) ->
  columnCount = (yield parser.readUInt16LE("length")) / 2

  orderColumns = []
  for c in [1..columnCount]
    orderColumns.push(yield parser.readUInt16LE())

  # Return token
  name: 'ORDER'
  event: 'order'
  orderColumns: orderColumns
