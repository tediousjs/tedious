Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
async = require('async')

getConfig = ->
  JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

exports.smallRows = (test) ->
  rows = 50000

  createTableSql = 'create table #many_rows (id int, first_name varchar(20), last_name varchar(20))'
  insertRowSql = """
      insert into #many_rows (id, first_name, last_name) values(@count, 'MyFirstName', 'YourLastName')
    """

  createInsertSelect(test, rows, createTableSql, insertRowSql)

exports.mediumRows = (test) ->
  rows = 2000

  medium = ''
  for i in [1..8000]
    medium += 'x'

  createTableSql = 'create table #many_rows (id int, first_name varchar(20), last_name varchar(20), medium varchar(8000))'
  insertRowSql = """
      insert into #many_rows (id, first_name, last_name, medium) values(@count, 'MyFirstName', 'YourLastName', '#{medium}')
    """

  createInsertSelect(test, rows, createTableSql, insertRowSql)

createInsertSelect = (test, rows, createTableSql, insertRowSql) ->
  test.expect(2)

  insertRowsSql = """
    declare @count int
    set @count = #{rows}

    while @count > 0
    begin
      #{insertRowSql}
      set @count = @count - 1
    end
    """
  selectSql = 'select * from #many_rows'

  config = getConfig()
  connection = new Connection(config)

  createTable = (callback) ->
    request = new Request(createTableSql, (err, rowCount) ->
      callback(err)
    )

    console.log 'Creating table'
    connection.execSqlBatch(request)

  insertRows = (callback) ->
    request = new Request(insertRowsSql, (err, rowCount) ->
      callback(err)
    )

    console.log 'Inserting rows'
    connection.execSqlBatch(request)

  select = (callback) ->
    start = Date.now()
    request = new Request(selectSql, (err, rowCount) ->
      test.strictEqual(rows, rowCount)

      durationMillis = Date.now() - start
      console.log "Took #{durationMillis / 1000}s"
      console.log "#{rows / (durationMillis / 1000)} rows/sec"
      console.log "#{(rows * insertRowSql.length) / (durationMillis / 1000)} bytes/sec"

      callback(err)
    )

    request.on('row', (columns) ->
        #console.log(columns[0].value)
    )

    console.log 'Selecting rows'
    connection.execSqlBatch(request)

  connection.on('connect', (err) ->
    test.ok(!err)

    async.series([
        createTable,
        insertRows,
        select,
        () ->
          connection.close()
    ]);
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('errorMessage', (error) ->
    #console.log("#{error.number} : #{error.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )
