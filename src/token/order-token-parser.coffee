# s2.2.7.14

parser = (buffer, callback) ->
  buffer.readUInt16LE((columnCount) ->
    columnCount /= 2

    requestValues = {}
    for c in [1..columnCount]
      requestValues["orderColumn#{c}"] = buffer.readUInt16LE

    buffer.readMultiple(requestValues, (values) ->
      orderColumns = []
      for c in [1..columnCount]
        orderColumns.push(values["orderColumn#{c}"])

      token =
        name: 'ORDER'
        event: 'order'
        columnCount: columnCount
        orderColumns: orderColumns

      callback(token)
    )
  )

module.exports = parser
