dgram = require('dgram')

SQL_SERVER_BROWSER_PORT = 1434
TIMEOUT = 2 * 1000
RETRIES = 3

# There are three bytes at the start of the response, whose purpose is unknown.
MYSTERY_HEADER_LENGTH = 3

# Most of the functionality has been determined from from jTDS's MSSqlServerInfo class.
exports.instanceLookup = (server, instanceName, callback, timeout, retries) ->
  timeout = timeout || TIMEOUT
  retriesLeft = retries || RETRIES
  timer = undefined
  socket = undefined

  message = (message, rinfo) ->
    if timer
      clearTimeout(timer)
      timer = undefined

    message = message.toString('ascii', MYSTERY_HEADER_LENGTH)
    port = parseBrowserResponse(message, instanceName)

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

  timedOut = () ->
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

      timer = setTimeout(timedOut, timeout)
    else
      callback("Failed to get response from SQL Server Browser on #{server}")

  makeAttempt()

parseBrowserResponse = (response, instanceName) ->
  instances = response.split(';;')

  for instance in instances
    parts = instance.split(';')

    for p in [0..parts.length - 1] by 2
      name = parts[p]
      value = parts[p + 1]

      if (name == 'tcp' && getPort)
        port = parseInt(value, 10)
        return port

      if name == 'InstanceName'
        if value.toUpperCase() == instanceName.toUpperCase()
          getPort = true
        else
          getPort = false

  undefined

exports.parseBrowserResponse = parseBrowserResponse
