'use strict';

const dgram = require('dgram');

const SQL_SERVER_BROWSER_PORT = 1434;
const TIMEOUT = 2 * 1000;
const RETRIES = 3;
// There are three bytes at the start of the response, whose purpose is unknown.
const MYSTERY_HEADER_LENGTH = 3;

// Most of the functionality has been determined from from jTDS's MSSqlServerInfo class.
module.exports.instanceLookup = instanceLookup;
function instanceLookup(server, instanceName, callback, timeout, retries) {
  let socket, timer;
  timeout = timeout || TIMEOUT;
  let retriesLeft = retries || RETRIES;

  function onMessage(message) {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    message = message.toString('ascii', MYSTERY_HEADER_LENGTH);
    const port = parseBrowserResponse(message, instanceName);
    socket.close();
    if (port) {
      return callback(undefined, port);
    } else {
      return callback('Port for ' + instanceName + ' not found in ' + message);
    }
  }

  function onError(err) {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    socket.close();
    return callback('Failed to lookup instance on ' + server + ' - ' + err.message);
  }

  function onTimeout() {
    timer = undefined;
    socket.close();
    return makeAttempt();
  }

  function makeAttempt() {
    if (retriesLeft > 0) {
      retriesLeft--;
      const request = new Buffer([0x02]);
      socket = dgram.createSocket('udp4');
      socket.on('error', onError);
      socket.on('message', onMessage);
      socket.send(request, 0, request.length, SQL_SERVER_BROWSER_PORT, server);
      return timer = setTimeout(onTimeout, timeout);
    } else {
      return callback('Failed to get response from SQL Server Browser on ' + server);
    }
  }

  return makeAttempt();
}

module.exports.parseBrowserResponse = parseBrowserResponse;
function parseBrowserResponse(response, instanceName) {
  let getPort;

  const instances = response.split(';;');
  for (let i = 0, len = instances.length; i < len; i++) {
    const instance = instances[i];
    const parts = instance.split(';');

    for (let p = 0, partsLen = parts.length; p < partsLen; p += 2) {
      const name = parts[p];
      const value = parts[p + 1];

      if (name === 'tcp' && getPort) {
        const port = parseInt(value, 10);
        return port;
      }

      if (name === 'InstanceName') {
        if (value.toUpperCase() === instanceName.toUpperCase()) {
          getPort = true;
        } else {
          getPort = false;
        }
      }
    }
  }
}
