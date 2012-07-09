Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
async = require('async')

debug = false

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

if (debug)
  config.options.debug =
    packet: true
    data: true
    payload: true
    token: true
    log: true
else
  config.options.debug = {}

exports.beginCommitTransaction = (test) ->
  test.expect(4)

  connection = new Connection(config)

  beginTransaction = (callback) ->
    connection.beginTransaction((err, transactionDescriptor) ->
      test.ok(!err)
      test.ok(transactionDescriptor)
      callback(err)
    , 'abc')

  select = (callback) ->
    request = new Request('select 3', (err) ->
      test.ok(!err)
      callback(err)
    )

    connection.execSql(request)

  commitTransaction = (callback) ->
    connection.commitTransaction((err) ->
      test.ok(!err)
      connection.close()
      callback(err)
    )

  connection.on('connect', (err) ->
    async.series([
        beginTransaction
        select
        commitTransaction
        () ->
          connection.close()
    ]);
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('errorMessage', (error) ->
    console.log("#{error.number} : #{error.message}")
  )

  connection.on('debug', (message) ->
    if (debug)
      console.log(message)
  )
