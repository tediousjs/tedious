fs = require('fs')
instanceLookup = require('../../src/instance-lookup').instanceLookup

RESERVED_IP_ADDRESS = '192.0.2.0'     # Can never be used, so guaranteed to fail.

getConfig = ->
  server: JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config.server
  instanceName: JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).instanceName

exports.goodInstance = (test) ->
  config = getConfig()

  if !config.instanceName
    # Config says don't do this test (probably because SQL Server Browser is not available).
    console.log('Skipping goodInstance test')
    test.done()
    return

  callback = (err, port) ->
    test.ok(!err)
    test.ok(port)

    test.done()

  instanceLookup(config.server, config.instanceName, callback)

exports.badInstance = (test) ->
  config = getConfig()

  callback = (err, port) ->
    test.ok(err)
    test.ok(!port)

    test.done()

  instanceLookup(config.server, 'badInstanceName', callback, 100, 1)

exports.badServer = (test) ->
  config = getConfig()

  callback = (err, port) ->
    test.ok(err)
    test.ok(!port)

    test.done()

  instanceLookup(RESERVED_IP_ADDRESS, config.instanceName, callback, 100, 1)
