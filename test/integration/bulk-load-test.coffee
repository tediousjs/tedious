Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
TYPES = require('../../src/data-type').typeByName

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

  config.options.debug =
    packet: true
    data: true
    payload: true
    token: false
    log: true

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION

  config

exports.bulkLoad = (test) ->
  config = getConfig()

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ifError(err)

    bulk = connection.newBulkLoad('#tmpTestTable', (err, rowCount) ->
      test.ifError(err)

      test.strictEqual(rowCount, 5, 'Incorrect number of rows inserted.');
      connection.close()
    )

    bulk.addColumn('nnn', TYPES.Int, { nullable: false })
    bulk.addColumn('sss', TYPES.NVarChar, { length: 50, nullable: true })
    bulk.addColumn('ddd', TYPES.DateTime, { nullable: false })

    # create temporary table
    request = new Request(bulk.getTableCreationSql(), (err) ->
      test.ifError(err)

      bulk.addRow({ nnn: 201, sss: "one zero one", ddd: new Date(1986, 6, 20) })
      bulk.addRow([ 202, "one zero two", new Date() ])
      bulk.addRow(203, "one zero three", new Date(2013, 7, 12))
      bulk.addRow({ nnn: 204, sss: "one zero four", ddd: new Date() })
      bulk.addRow({ nnn: 205, sss: "one zero five", ddd: new Date() })

      connection.execBulkLoad(bulk)
    )

    connection.execSqlBatch(request)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.bulkLoadError = (test) ->
  config = getConfig()

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ifError(err)

    bulk = connection.newBulkLoad('#tmpTestTable2', (err, rowCount) ->
      test.ok(err, 'An error should have been thrown to indicate the incorrect table format.')
      connection.close()
    )

    bulk.addColumn('x', TYPES.Int, { nullable: false })
    bulk.addColumn('y', TYPES.Int, { nullable: false })

    # create temporary table with an incorrect schema
    request = new Request("CREATE TABLE #tmpTestTable2 ([id] int not null)", (err) ->
      test.ifError(err)

      bulk.addRow({ x: 1, y: 1 })

      connection.execBulkLoad(bulk)
    )

    connection.execSqlBatch(request)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )
