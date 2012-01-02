connectionGF = require('../../lib/connection/connection-statemachine')
ignite = require('ignite')
fs = require('fs')

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8'))
  config.options.debug =
    data: true
    payload: true
    token: true

  config

exports.connect = (test) ->
  imports = {}
  options = {}
  factory = new ignite.Factory(connectionGF, imports, options)

  config = getConfig()
  config.options.port = -1
  config.options.connectTimeout = 200

  factory.spawn(config)

  #test.done()
