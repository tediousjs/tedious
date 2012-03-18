dgram = require('dgram')

SQL_SERVER_BROWSER_PORT = 1434
TIMEOUT = 2 * 1000
RETRIES = 3

module.exports = (server, instanceName, callback) ->
  retriesLeft = RETRIES
  timer = undefined
  socket = undefined

  message = (message, rinfo) ->
    if timer
      clearTimeout(timer)
      timer = undefined

    message = message.toString('ascii', 3)
    parts = message.split(';')

    for p in [0..parts.length - 1] by 2
      name = parts[p]
      value = parts[p + 1]

      if (name == 'tcp' && getPort)
        port = parseInt(value, 10)

      if name == 'InstanceName'
        if value.toUpperCase() == instanceName.toUpperCase()
          getPort = true
        else
          getPort = false

    socket.close()

    if port
      callback(undefined, port)
    else
      callback("Port for #{instanceName} not found in #{message}")

  error = (err) ->
    if timer
      clearTimeout(timer)
      timer = undefined

    socket.close()

    callback("Failed to lookup instance on #{server} : #{err}")

  timeout = () ->
    timer = undefined
    socket.close()
    makeAttempt()

  makeAttempt = () ->
    if retriesLeft > 0
      retriesLeft--

      request = new Buffer([0x02])

      socket = dgram.createSocket('udp4')
      socket.on('error', error)
      socket.on('message', message)

      socket.send(request, 0, request.length, SQL_SERVER_BROWSER_PORT, server)

      timer = setTimeout(timeout, TIMEOUT)
    else
      callback("Failed to get response from SQL Server Browser on #{server}")

  makeAttempt()

