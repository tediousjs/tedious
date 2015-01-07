# s2.2.7.14

module.exports = ->
  columnCount = 0
  orderColumns = []

  @uint16le("length").tap ->
    columnCount = @vars.length / 2

  @loop (end) ->
    if columnCount == orderColumns.length
      return end(true)

    @uint16le("column").tap ->
      orderColumns.push(@vars.column)

  @tap ->
    @push
      name: 'ORDER'
      event: 'order'
      orderColumns: orderColumns
