'use strict';

var dgram = require('dgram');

var SQL_SERVER_BROWSER_PORT = 1434;
var TIMEOUT = 2 * 1000;
var RETRIES = 3;
// There are three bytes at the start of the response, whose purpose is unknown.
var MYSTERY_HEADER_LENGTH = 3;

// Most of the functionality has been determined from from jTDS's MSSqlServerInfo class.
module.exports.instanceLookup = instanceLookup;
function instanceLookup(server, instanceName, callback, timeout, retries) {
  var socket = void 0,
      timer = void 0;
  timeout = timeout || TIMEOUT;
  var retriesLeft = retries || RETRIES;

  function onMessage(message) {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    message = message.toString('ascii', MYSTERY_HEADER_LENGTH);
    var port = parseBrowserResponse(message, instanceName);
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
      var request = new Buffer([0x02]);
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
  var getPort = void 0;

  var instances = response.split(';;');
  for (var i = 0, len = instances.length; i < len; i++) {
    var instance = instances[i];
    var parts = instance.split(';');

    for (var p = 0, partsLen = parts.length; p < partsLen; p += 2) {
      var name = parts[p];
      var value = parts[p + 1];

      if (name === 'tcp' && getPort) {
        var port = parseInt(value, 10);
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