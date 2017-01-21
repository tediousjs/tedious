'use strict';

const dgram = require('dgram');
const lookupAll = require('dns-lookup-all');

const SQL_SERVER_BROWSER_PORT = 1434;
const TIMEOUT = 2 * 1000;
const RETRIES = 3;
// There are three bytes at the start of the response, whose purpose is unknown.
const MYSTERY_HEADER_LENGTH = 3;

// Most of the functionality has been determined from from jTDS's MSSqlServerInfo class.
module.exports.instanceLookup = instanceLookup;
function instanceLookup(options, callback) {
  const server = options.server;
  if (typeof server !== 'string') {
    throw new TypeError('Invalid arguments: "server" must be a string');
  }

  const instanceName = options.instanceName;
  if (typeof instanceName !== 'string') {
    throw new TypeError('Invalid arguments: "instanceName" must be a string');
  }

  const timeout = options.timeout === undefined ? TIMEOUT : options.timeout;
  if (typeof timeout !== 'number') {
    throw new TypeError('Invalid arguments: "timeout" must be a number');
  }

  const retries = options.retries === undefined ? RETRIES : options.retries;
  if (typeof retries !== 'number') {
    throw new TypeError('Invalid arguments: "retries" must be a number');
  }

  if (typeof callback !== 'function') {
    throw new TypeError('Invalid arguments: "callback" must be a function');
  }

  const multiSubnetFailover = options.multiSubnetFailover !== undefined && options.multiSubnetFailover;
  let socket, timer, retriesLeft = retries;

  function onMessage(message) {
    clearTimeout(timer);
    socket.close();

    message = message.toString('ascii', MYSTERY_HEADER_LENGTH);
    const port = parseBrowserResponse(message, instanceName);

    if (port) {
      return callback(undefined, port);
    } else {
      return callback('Port for ' + instanceName + ' not found in ' + message);
    }
  }

  function onError(err) {
    clearTimeout(timer);
    socket.close();

    return callback('Failed to lookup instance on ' + server + ' - ' + err.message);
  }

  function onTimeout() {
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

      if (multiSubnetFailover) {
        // TODO: Support both IPv4 and IPv6 here.
        lookupAll(server, 4, (err, addresses) => {
          if (err) {
            return callback(err.message);
          }

          const len = addresses.length;
          for (let i = 0; i < len; i++) {
            socket.send(request, 0, request.length, SQL_SERVER_BROWSER_PORT, addresses[i].address);
          }
        });
      } else {
        socket.send(request, 0, request.length, SQL_SERVER_BROWSER_PORT, server);
      }

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
